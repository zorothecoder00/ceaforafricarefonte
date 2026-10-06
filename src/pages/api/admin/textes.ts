/* Textes et images du site (éditeur visuel) : droit contenus (M) sur tout le site.
   POST { action: 'save', page, kind, key, original, value, scope: 'page' | 'site' } → { ok, value, s }
   POST { action: 'reset', page, kind, key, original, scope: 'page' | 'site' } → { ok, value, s } (valeur désormais affichée)
   POST { action: 'update', id, value } · { action: 'delete', id } (liste du back-office)
   POST { action: 'reseaux', linkedin: 'https://…', … } (réseaux sociaux du pied de page) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { siteText } from '../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { canEditSite, clearOverrides, keyOf, norm, safeAttr, SITE, ATTRS } from '../../../lib/site-text';
import { setSetting, SETTINGS } from '../../../lib/settings';

export const prerender = false;

const Kind = z.enum(['text', ...ATTRS]);
const Page = z.string().regex(/^\/[^\s<>"]{0,300}$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), page: Page, kind: Kind, key: z.string().max(40), original: z.string().max(5000), value: z.string().max(5000), scope: z.enum(['page', 'site']) }),
  z.object({ action: z.literal('reset'), page: Page, kind: Kind, key: z.string().max(40), original: z.string().max(5000), scope: z.enum(['page', 'site']) }),
  z.object({ action: z.literal('update'), id: z.uuid(), value: z.string().max(5000) }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
  z.object({ action: z.literal('reseaux') }).catchall(z.string().trim().max(300)),
]);

// Caractères de contrôle retirés (sauf retours à la ligne, réduits par l'affichage)
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');

/** Valeur effectivement affichée sur la page après la modification. */
async function effective(page: string, key: string): Promise<{ value: string | null; s: string }> {
  const rows = await db.select({ scope: siteText.scope, value: siteText.value }).from(siteText).where(and(eq(siteText.key, key), inArray(siteText.scope, [page, SITE])));
  const p = rows.find((r) => r.scope === page), s = rows.find((r) => r.scope === SITE);
  return p ? { value: p.value, s: 'p' } : s ? { value: s.value, s: 's' } : { value: null, s: '' };
}

export const POST: APIRoute = async ({ locals, request }) => {
  const u = locals.user;
  if (!canEditSite(u)) return fail(u ? 'Accès refusé : droit de modification des contenus requis (avec double authentification).' : 'Connexion requise.', u ? 403 : 401);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const b = p.data;
  const ip = clientIp(request);

  if (b.action === 'reseaux') {
    const def = SETTINGS.reseaux.defaults as Record<string, string>;
    const links: Record<string, string> = {};
    for (const k of Object.keys(def)) {
      const v = (b as Record<string, string>)[k]?.trim() ?? '';
      if (v && !/^https:\/\//i.test(v)) return fail(`Adresse ${k} : elle doit commencer par https://`);
      links[k] = v;
    }
    await setSetting('reseaux', links as never, u.id);
    await audit(u.id, 'site.reseaux', 'reseaux', links, ip);
    return json({ ok: true, message: 'Réseaux sociaux enregistrés.' });
  }

  if (b.action === 'update' || b.action === 'delete') {
    const [row] = await db.select().from(siteText).where(eq(siteText.id, b.id));
    if (!row) return fail('Modification introuvable.', 404);
    if (b.action === 'delete' || norm(b.value) === row.original) {
      await db.delete(siteText).where(eq(siteText.id, b.id));
      await audit(u.id, 'site.texte.retabli', row.scope, { kind: row.kind, original: row.original, avant: row.value }, ip);
    } else {
      const value = row.kind === 'text' ? clean(b.value) : b.value.trim();
      if (row.kind !== 'text' && !safeAttr(row.kind, value)) return fail('Valeur refusée pour ce type d’élément.');
      await db.update(siteText).set({ value, updatedBy: u.id, updatedAt: new Date() }).where(eq(siteText.id, b.id));
      await audit(u.id, 'site.texte.modifie', row.scope, { kind: row.kind, original: row.original, avant: row.value, apres: value }, ip);
    }
    clearOverrides();
    return json({ ok: true, message: b.action === 'delete' ? 'Texte d’origine rétabli.' : 'Enregistré.' });
  }

  // Éditeur visuel : la clé envoyée doit correspondre au texte d'origine
  const original = norm(b.original);
  if (keyOf(b.kind, original) !== b.key) return fail('Ce texte a changé depuis l’ouverture de la page : rechargez-la.', 409);
  const scope = b.scope === 'site' ? SITE : b.page;

  if (b.action === 'reset') {
    const del = await db.delete(siteText).where(and(eq(siteText.key, b.key), eq(siteText.scope, scope))).returning();
    if (del[0]) await audit(u.id, 'site.texte.retabli', scope, { kind: b.kind, original, avant: del[0].value }, ip);
  } else {
    const value = b.kind === 'text' ? clean(b.value) : b.value.trim();
    if (b.kind !== 'text' && !safeAttr(b.kind, value)) return fail(b.kind === 'href' ? 'Lien refusé : il doit commencer par https://, /, mailto: ou tel:.' : 'Valeur refusée pour ce type d’élément.');
    if (b.kind !== 'text' && !value) return fail('La valeur ne peut pas être vide.');
    const [before] = await db.select().from(siteText).where(and(eq(siteText.key, b.key), eq(siteText.scope, scope)));
    if (norm(value) === original) await db.delete(siteText).where(and(eq(siteText.key, b.key), eq(siteText.scope, scope)));
    else await db.insert(siteText).values({ scope, key: b.key, kind: b.kind, original, value, updatedBy: u.id })
      .onConflictDoUpdate({ target: [siteText.scope, siteText.key], set: { value, updatedBy: u.id, updatedAt: new Date() } });
    // Portée « tout le site » : la version propre à cette page (qui primerait) est retirée
    if (scope === SITE) await db.delete(siteText).where(and(eq(siteText.key, b.key), eq(siteText.scope, b.page)));
    await audit(u.id, 'site.texte.modifie', scope, { kind: b.kind, original, avant: before?.value ?? original, apres: value, page: b.page }, ip);
  }
  clearOverrides();
  const eff = await effective(b.page, b.key);
  return json({ ok: true, value: eff.value ?? original, s: eff.s, message: b.action === 'reset' ? 'Texte d’origine rétabli.' : 'Enregistré.' });
};
