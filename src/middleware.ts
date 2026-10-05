/* Middleware : sur les routes rendues à la demande, charge l'utilisateur et ses rôles dans Astro.locals,
   protège l'espace membre et le back-office (rôles + double authentification), et ajoute les en-têtes de sécurité. */
import { defineMiddleware } from 'astro:middleware';
import { getCurrentUser } from './lib/session';
import { isStaff, needs2fa } from './lib/rbac';
import { findRedirect } from './lib/redirects';

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
  ctx.locals.user = await getCurrentUser(ctx.request.headers).catch(() => null);
  const user = ctx.locals.user;
  const login = (reason: string) => ctx.redirect(`/connexion?retour=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}&motif=${reason}`);

  if (path.startsWith('/espace')) {
    if (!user) return login('espace');
  }
  if (path.startsWith('/admin')) {
    if (!user) return login('admin');
    if (!isStaff(user.roles)) return new Response('Accès réservé aux équipes CEA.', { status: 403 });
    if (needs2fa(user.roles) && !user.twoFactorEnabled && !path.startsWith('/admin/securite')) return ctx.redirect('/espace/securite?motif=2fa');
  }

  const res = await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
  return res;
});
