/* Middleware : sur les routes rendues à la demande, charge l'utilisateur et ses rôles dans Astro.locals,
   protège l'espace membre et le back-office (rôles + double authentification), et ajoute les en-têtes de sécurité. */
import { defineMiddleware } from 'astro:middleware';
import { getCurrentUser } from './lib/session';
import { isStaff, needs2fa } from './lib/rbac';
import { findRedirect } from './lib/redirects';
import { loadRights } from './lib/rights';
import { applySiteText, canEditSite, loadOverrides, pageScope, SITE } from './lib/site-text';
import type { CurrentUser } from './lib/session';
import { REF_COOKIE, attachReferral, validCode } from './lib/referrals';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(self)',
};

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.isPrerendered) return next(); // pages statiques : aucune requête base de données à la génération

  // Redirections définies dans le paramétrage (CDC §12)
  if (ctx.request.method === 'GET') {
    const r = await findRedirect(ctx.url.pathname);
    if (r) return ctx.redirect(r.to + (r.to.includes('?') ? '' : ctx.url.search), r.code as 301 | 302);
  }

  const path = ctx.url.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  await loadRights(); // matrice des droits modifiée depuis le back-office
  ctx.locals.user = await getCurrentUser(ctx.request.headers).catch(() => null);
  const user = ctx.locals.user;
  // Parrainage (CDC §7.8) : le code du lien /?parrain=CODE est retenu 30 jours, puis rattaché au compte créé entre-temps
  const refCode = ctx.url.searchParams.get('parrain')?.toUpperCase();
  if (refCode && validCode(refCode) && !user) ctx.cookies.set(REF_COOKIE, refCode, { path: '/', maxAge: 30 * 86400, httpOnly: true, sameSite: 'lax', secure: ctx.url.protocol === 'https:' });
  const pendingRef = ctx.cookies.get(REF_COOKIE)?.value;
  if (user && pendingRef) {
    await attachReferral(user.id, pendingRef).catch(() => false);
    ctx.cookies.delete(REF_COOKIE, { path: '/' });
  }
  const login = (reason: string) => ctx.redirect(`/connexion?retour=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}&motif=${reason}`);

  if (path.startsWith('/espace')) {
    if (!user) return login('espace');
  }
  if (path.startsWith('/admin')) {
    if (!user) return login('admin');
    // Équipes CEA : rôle du back-office, ou collaborateur dont la fiche personnel (CEA OS) est active
    if (!isStaff(user.roles) && !user.staffId) return new Response('Accès réservé aux équipes CEA.', { status: 403 });
    if ((needs2fa(user.roles) || user.staffId) && !user.twoFactorEnabled && !path.startsWith('/admin/securite')) return ctx.redirect('/espace/securite?motif=2fa');
  }

  let res = await next();
  if (ctx.request.method === 'GET' && !path.startsWith('/api/') && (res.headers.get('content-type') ?? '').includes('text/html')) res = await siteText(ctx.url, path, user, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
  return res;
});

/** Textes et images modifiés depuis le back-office ; mode édition (?edition=1) pour les éditeurs et administrateurs. */
async function siteText(url: URL, path: string, user: CurrentUser | null | undefined, res: Response): Promise<Response> {
  const inside = path.startsWith('/admin') || path.startsWith('/espace');
  const edit = !inside && url.searchParams.has('edition') && canEditSite(user);
  const all = await loadOverrides();
  const scope = pageScope(url.pathname);
  const page = inside ? undefined : all.get(scope), site = all.get(SITE);
  if (!edit && !page?.size && !site?.size) return res;
  const { html, originals } = applySiteText(await res.text(), { page, site, siteOutsideMainOnly: inside, edit });
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  if (!edit) return new Response(html, { status: res.status, headers });
  headers.set('Cache-Control', 'private, no-store');
  const data = JSON.stringify({ page: scope, originals }).replace(/</g, '\\u003c');
  const tools = `<script type="application/json" id="cea-edit-data">${data}</script><link rel="stylesheet" href="/editeur.css" /><script src="/editeur.js" defer></script>`;
  return new Response(html.replace(/<\/body>/i, tools + '</body>'), { status: res.status, headers });
}
