/* Domaines d'intervention (back-office) : droit Paramétrage — C pour créer, M pour modifier, masquer ou supprimer.
   POST { action:'save', id, isNew, icon, name, dom, summary, highlight, link, audience, method, deliverables, position, active }
        → crée un domaine, ou modifie un domaine (un domaine du code modifié est enregistré en base et le remplace)
   POST { action:'toggle', id, active }  → affiche ou masque un domaine (partout sur le site)
   POST { action:'delete', id }          → supprime un domaine créé, ou rétablit l'original d'un domaine du code
   Chaque action est inscrite au journal d'audit. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { domain } from '../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { allDomains, clearDomainCache } from '../../../lib/domains';
import { DOMAINS, ICON } from '../../../data/site';

export const prerender = false;

const lines = (max: number) => z.string().max(3000).transform((s) => s.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, max));
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'), isNew: z.preprocess((v) => v === true || v === '1', z.boolean()),
    id: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, 'Identifiant : lettres minuscules, chiffres et tirets (2 à 41 caractères)'),
    icon: z.string().refine((i) => i in ICON, 'Icône inconnue'),
    name: z.string().trim().min(2).max(80), dom: z.string().trim().min(2).max(80), summary: z.string().trim().min(10).max(220),
    highlight: z.string().trim().max(80).default(''), link: z.string().trim().max(200).regex(/^(\/[^\s]*|https:\/\/\S+)?$/, 'Lien : adresse du site (/…) ou https://').default(''),
    audience: z.string().trim().max(300).default(''), method: lines(10), deliverables: lines(10),
    position: z.coerce.number().int().min(0).max(999).default(100), active: z.boolean().default(true),
  }),
  z.object({ action: z.literal('toggle'), id: z.string().max(41), active: z.boolean() }),
  z.object({ action: z.literal('delete'), id: z.string().max(41) }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const raw = await request.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const ip = clientIp(request);
  const coded = DOMAINS.some((d) => d.id === b.id);
  const [row] = await db.select().from(domain).where(eq(domain.id, b.id));

  if (b.action === 'save') {
    const exists = coded || !!row;
    const u = staffApi(locals.user, 'parametres', b.isNew ? 'C' : 'M'); if (u instanceof Response) return u;
    if (b.isNew && exists) return fail('Cet identifiant est déjà utilisé par un autre domaine.');
    if (!b.isNew && !exists) return fail('Domaine introuvable.', 404);
    const values = { icon: b.icon, name: b.name, dom: b.dom, summary: b.summary, highlight: b.highlight, link: b.link || null, audience: b.audience, method: b.method, deliverables: b.deliverables, position: b.position, active: b.active, updatedBy: u.id, updatedAt: new Date() };
    await db.insert(domain).values({ id: b.id, ...values }).onConflictDoUpdate({ target: domain.id, set: values });
    clearDomainCache();
    await audit(u.id, b.isNew ? 'domaine.creation' : 'domaine.modification', b.id, { dom: b.dom }, ip);
    return json({ ok: true, message: b.isNew ? `Domaine « ${b.dom} » créé : il apparaît sur l'accueil, dans le menu et sur /domaines.` : 'Domaine enregistré.', redirect: `/admin/domaines?id=${b.id}` });
  }

  const u = staffApi(locals.user, 'parametres', 'M'); if (u instanceof Response) return u;
  if (b.action === 'toggle') {
    if (!row && !coded) return fail('Domaine introuvable.', 404);
    if (!row) {
      // Domaine du code : on l'enregistre en base pour mémoriser qu'il est masqué
      const d = (await allDomains({ all: true })).find((x) => x.id === b.id)!;
      await db.insert(domain).values({ id: d.id, icon: d.ic, name: d.n, dom: d.dom, summary: d.d, highlight: d.k, link: d.to, audience: d.pub, method: d.met, deliverables: d.liv, position: d.position, active: b.active, updatedBy: u.id });
    } else await db.update(domain).set({ active: b.active, updatedBy: u.id, updatedAt: new Date() }).where(eq(domain.id, b.id));
    clearDomainCache();
    await audit(u.id, b.active ? 'domaine.affichage' : 'domaine.masquage', b.id, {}, ip);
    return json({ ok: true, message: b.active ? 'Domaine affiché sur le site.' : 'Domaine masqué : il n’apparaît plus sur le site.' });
  }
  // delete
  if (!row) return fail(coded ? 'Ce domaine du code n’a pas été modifié : utilisez « Masquer » pour le retirer du site.' : 'Domaine introuvable.', 404);
  await db.delete(domain).where(eq(domain.id, b.id));
  clearDomainCache();
  await audit(u.id, coded ? 'domaine.retablissement' : 'domaine.suppression', b.id, {}, ip);
  return json({ ok: true, message: coded ? 'Domaine rétabli dans sa version d’origine.' : 'Domaine supprimé.', redirect: '/admin/domaines' });
};
