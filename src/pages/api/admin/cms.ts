/* API du CMS éditorial (CDC §12). Droits : objet « contenus » de la matrice (§18) — C/M pour rédiger, V pour valider et publier.
   POST { action, … } :
   - create { title, lang }                     → nouveau brouillon
   - import { articleId }                        → reprise d'un article écrit dans le code (brouillon, même identifiant d'URL)
   - save { id, version, …champs, blocks }       → enregistrement (contrôle de version) ; un contenu en ligne ne se modifie qu'avec le droit V
   - transition { id, to, publishAt?, note? }    → étape du circuit rédaction → relecture → validation → publication
   - translate { id, lang }                      → crée la version dans une autre langue (brouillon)
   - restore { id, revisionId }                  → restaure une version de l'historique
   - delete { id }                               → suppression d'un brouillon ou d'un contenu archivé (droit V)
   Chaque action crée une entrée d'historique (cms_revision) et une ligne du journal d'audit. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../../lib/db';
import { cmsContent, cmsRevision, cmsMedia } from '../../../db/schema/app';
import { json, fail, audit, clientIp, type CurrentUser } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { can } from '../../../lib/rbac';
import { Blocks, TRANSITIONS, isLive, slugify, staticArticleBlocks, type CmsStatus } from '../../../lib/cms';
import { ARTICLES } from '../../../data/site';

export const prerender = false;

const id = z.uuid();
const Lang = z.enum(['fr', 'en']);
const Fields = z.object({
  title: z.string().trim().min(2).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identifiant d’URL : lettres minuscules, chiffres et tirets').max(80),
  excerpt: z.string().trim().max(400),
  category: z.string().trim().max(60).nullable(),
  country: z.string().trim().max(60).nullable(),
  blocks: Blocks,
  coverId: z.uuid().nullable(),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(170).nullable(),
  featured: z.boolean(),
});
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), title: z.string().trim().min(2).max(200), lang: Lang.default('fr') }),
  z.object({ action: z.literal('import'), articleId: z.string().max(20) }),
  z.object({ action: z.literal('save'), id, version: z.number().int(), ...Fields.shape }),
  z.object({ action: z.literal('transition'), id, to: z.enum(['brouillon', 'en_relecture', 'valide', 'programme', 'publie', 'archive']), publishAt: z.iso.datetime({ offset: true }).optional(), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('translate'), id, lang: Lang }),
  z.object({ action: z.literal('restore'), id, revisionId: id }),
  z.object({ action: z.literal('delete'), id }),
]);

type Content = typeof cmsContent.$inferSelect;
const snapshot = (c: Content) => ({ title: c.title, slug: c.slug, excerpt: c.excerpt, category: c.category, country: c.country, blocks: c.blocks, coverId: c.coverId, seoTitle: c.seoTitle, seoDescription: c.seoDescription, featured: c.featured, publishAt: c.publishAt });
async function revise(c: Content, by: string, note?: string) {
  await db.insert(cmsRevision).values({ contentId: c.id, version: c.version, status: c.status, snapshot: snapshot(c), note: note ?? null, authorId: by });
}
/** Identifiant d'URL libre dans la langue (suffixe -2, -3… si besoin). */
async function freeSlug(base: string, lang: string, exceptKey?: string) {
  for (let i = 1; i < 50; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ key: cmsContent.key }).from(cmsContent).where(and(eq(cmsContent.type, 'article'), eq(cmsContent.lang, lang), eq(cmsContent.slug, s)));
    if (!hit || hit.key === exceptKey) return s;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide : ' + p.error.issues.map((i) => i.message).join(', '));
  const b = p.data;
  const ip = clientIp(request);
  const u = staffApi(locals.user, 'contenus', b.action === 'create' || b.action === 'import' || b.action === 'translate' ? 'C' : 'M');
  if (u instanceof Response) return u;
  const canValidate = (x: CurrentUser) => can(x.roles, 'contenus', 'V');

  if (b.action === 'create' || b.action === 'import') {
    let values: typeof cmsContent.$inferInsert;
    if (b.action === 'import') {
      const a = ARTICLES.find((x) => x.id === b.articleId);
      if (!a) return fail('Article introuvable.', 404);
      const [dup] = await db.select({ id: cmsContent.id }).from(cmsContent).where(and(eq(cmsContent.type, 'article'), eq(cmsContent.lang, 'fr'), eq(cmsContent.slug, a.id)));
      if (dup) return json({ ok: true, redirect: `/admin/cms/${dup.id}`, message: 'Cet article est déjà dans le CMS.' });
      values = { key: randomUUID(), slug: a.id, lang: 'fr', title: a.t, excerpt: a.x, category: a.cat, country: a.c, featured: !!a.k, blocks: staticArticleBlocks(a), authorId: u.id, updatedBy: u.id };
    } else {
      values = { key: randomUUID(), slug: await freeSlug(slugify(b.title), b.lang), lang: b.lang, title: b.title, authorId: u.id, updatedBy: u.id, country: 'Panafricain' };
    }
    const [c] = await db.insert(cmsContent).values(values).returning();
    await revise(c, u.id, b.action === 'import' ? 'Import depuis le site' : 'Création');
    await audit(u.id, `cms.${b.action}`, c.id, { slug: c.slug }, ip);
    return json({ ok: true, redirect: `/admin/cms/${c.id}`, message: 'Brouillon créé.' });
  }

  const [c] = await db.select().from(cmsContent).where(eq(cmsContent.id, b.id));
  if (!c) return fail('Contenu introuvable.', 404);

  switch (b.action) {
    case 'save': {
      if (b.version !== c.version) return fail("Ce contenu a été modifié entre-temps par quelqu'un d'autre. Rechargez la page pour récupérer la dernière version.", 409);
      if (isLive(c) || c.status === 'valide' || c.status === 'programme') {
        if (!canValidate(u)) return fail('Ce contenu est validé ou en ligne : seule une personne habilitée à publier peut le corriger.', 403);
      }
      if (b.slug !== c.slug) {
        const [taken] = await db.select({ id: cmsContent.id }).from(cmsContent).where(and(eq(cmsContent.type, c.type), eq(cmsContent.lang, c.lang), eq(cmsContent.slug, b.slug), ne(cmsContent.id, c.id)));
        if (taken) return fail('Cet identifiant d’URL est déjà utilisé.');
      }
      if (b.coverId) { const [m] = await db.select({ id: cmsMedia.id }).from(cmsMedia).where(eq(cmsMedia.id, b.coverId)); if (!m) return fail('Image de couverture introuvable.'); }
      const { action: _a, id: _i, version: _v, ...fields } = b;
      const [n] = await db.update(cmsContent).set({ ...fields, version: c.version + 1, updatedBy: u.id, updatedAt: new Date() }).where(and(eq(cmsContent.id, c.id), eq(cmsContent.version, c.version))).returning();
      if (!n) return fail('Conflit de version : rechargez la page.', 409);
      await revise(n, u.id, isLive(c) ? 'Correction après publication' : undefined);
      await audit(u.id, 'cms.save', c.id, { version: n.version }, ip);
      return json({ ok: true, version: n.version, message: 'Enregistré.' });
    }
    case 'transition': {
      const t = TRANSITIONS[c.status].find((x) => x.to === b.to);
      if (!t) return fail('Étape impossible depuis l’état actuel.');
      if (t.needs === 'validate' && !canValidate(u)) return fail('Seule une personne habilitée à valider peut faire cette étape.', 403);
      if (b.to === 'programme' && (!b.publishAt || new Date(b.publishAt) <= new Date())) return fail('Choisissez une date de publication à venir.');
      if ((b.to === 'publie' || b.to === 'programme') && (!c.title || !(c.blocks as unknown[]).length)) return fail('Un contenu vide ne peut pas être publié.');
      const set: Partial<typeof cmsContent.$inferInsert> = { status: b.to as CmsStatus, version: c.version + 1, updatedBy: u.id, updatedAt: new Date() };
      if (b.to === 'programme') set.publishAt = new Date(b.publishAt!);
      if (b.to === 'publie') { set.publishedAt = c.publishedAt ?? new Date(); set.publishAt = null; }
      const [n] = await db.update(cmsContent).set(set).where(eq(cmsContent.id, c.id)).returning();
      await revise(n, u.id, `${t.label}${b.note ? ` — ${b.note}` : ''}`);
      await audit(u.id, `cms.etat.${b.to}`, c.id, { from: c.status, publishAt: set.publishAt ?? null }, ip);
      return json({ ok: true, message: `${t.label} : fait.` });
    }
    case 'translate': {
      if (b.lang === c.lang) return fail('Le contenu est déjà dans cette langue.');
      const [exists] = await db.select({ id: cmsContent.id }).from(cmsContent).where(and(eq(cmsContent.key, c.key), eq(cmsContent.lang, b.lang)));
      if (exists) return json({ ok: true, redirect: `/admin/cms/${exists.id}` });
      const [n] = await db.insert(cmsContent).values({ ...snapshot(c), publishAt: null, type: c.type, key: c.key, lang: b.lang, slug: await freeSlug(c.slug, b.lang, c.key), authorId: u.id, updatedBy: u.id }).returning();
      await revise(n, u.id, `Version ${b.lang.toUpperCase()} créée à partir de la version ${c.lang.toUpperCase()} (à traduire)`);
      await audit(u.id, 'cms.translate', n.id, { from: c.id }, ip);
      return json({ ok: true, redirect: `/admin/cms/${n.id}`, message: 'Version créée : traduisez le texte puis envoyez-la en relecture.' });
    }
    case 'restore': {
      const [r] = await db.select().from(cmsRevision).where(and(eq(cmsRevision.id, b.revisionId), eq(cmsRevision.contentId, c.id)));
      if (!r) return fail('Version introuvable.', 404);
      const live = isLive(c);
      if (live && !canValidate(u)) return fail('Ce contenu est en ligne : seule une personne habilitée à publier peut restaurer une version.', 403);
      const s = r.snapshot as ReturnType<typeof snapshot>;
      const parsed = Blocks.safeParse(s.blocks);
      const [n] = await db.update(cmsContent).set({
        title: s.title, slug: c.slug, excerpt: s.excerpt, category: s.category, country: s.country, blocks: parsed.success ? parsed.data : [], coverId: s.coverId, seoTitle: s.seoTitle, seoDescription: s.seoDescription, featured: s.featured,
        // Un contenu restauré hors ligne revient en rédaction pour repasser la relecture
        status: live ? c.status : 'brouillon', version: c.version + 1, updatedBy: u.id, updatedAt: new Date(),
      }).where(eq(cmsContent.id, c.id)).returning();
      await revise(n, u.id, `Restauration de la version ${r.version}`);
      await audit(u.id, 'cms.restore', c.id, { version: r.version }, ip);
      return json({ ok: true, message: `Version ${r.version} restaurée.` });
    }
    case 'delete': {
      if (!canValidate(u)) return fail('Suppression réservée aux personnes habilitées à publier.', 403);
      if (c.status !== 'brouillon' && c.status !== 'archive') return fail('Archivez le contenu avant de le supprimer.');
      await db.delete(cmsContent).where(eq(cmsContent.id, c.id));
      await audit(u.id, 'cms.delete', c.id, { slug: c.slug, title: c.title }, ip);
      return json({ ok: true, redirect: '/admin/cms', message: 'Contenu supprimé.' });
    }
  }
};
