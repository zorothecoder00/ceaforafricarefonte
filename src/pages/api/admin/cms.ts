/* API du CMS éditorial (CDC §12) : articles, événements, cours et pages.
   Droits : objet « contenus » de la matrice (§18) — C/M pour rédiger, V pour valider et publier.
   POST { action, … } :
   - create { type, title, lang }                → nouveau brouillon (événement et cours : identifiant court attribué, ex. e6, c9)
   - import { type, ref }                        → reprise d'un article, événement ou cours écrit dans le code (brouillon, même identifiant)
   - save { id, version, …champs, blocks, data } → enregistrement (contrôle de version) ; un contenu en ligne ne se modifie qu'avec le droit V
   - transition { id, to, publishAt?, note? }    → étape du circuit rédaction → relecture → validation → publication
   - translate { id, lang }                      → crée la version dans une autre langue (brouillon)
   - restore { id, revisionId }                  → restaure une version de l'historique
   - delete { id }                               → suppression d'un brouillon ou d'un contenu archivé (droit V)
   Chaque action crée une entrée d'historique (cms_revision) et une ligne du journal d'audit. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../../lib/db';
import { cmsContent, cmsRevision, cmsMedia, enrollment, eventTicket } from '../../../db/schema/app';
import { json, fail, audit, clientIp, type CurrentUser } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { can } from '../../../lib/rbac';
import { Blocks, TRANSITIONS, isLive, slugify, staticArticleBlocks, type CmsStatus } from '../../../lib/cms';
import { DATA_SCHEMA, emptyData, invalidateCatalog, staticEventData, staticCourseData, type CourseData, type EventData } from '../../../lib/catalog';
import { ARTICLES, EVENTS, COURSES } from '../../../data/site';

export const prerender = false;

const id = z.uuid();
const Lang = z.enum(['fr', 'en']);
const Type = z.enum(['article', 'event', 'course', 'page']);
type CType = z.infer<typeof Type>;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAGE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,3}$/;
const Fields = z.object({
  title: z.string().trim().min(2).max(200),
  slug: z.string().trim().max(120),
  excerpt: z.string().trim().max(600),
  category: z.string().trim().max(60).nullable(),
  country: z.string().trim().max(60).nullable(),
  blocks: Blocks,
  data: z.record(z.string(), z.unknown()).default({}),
  coverId: z.uuid().nullable(),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(170).nullable(),
  featured: z.boolean(),
});
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), type: Type.default('article'), title: z.string().trim().min(2).max(200), lang: Lang.default('fr') }),
  z.object({ action: z.literal('import'), type: Type.default('article'), ref: z.string().max(20) }),
  z.object({ action: z.literal('save'), id, version: z.number().int(), ...Fields.shape }),
  z.object({ action: z.literal('transition'), id, to: z.enum(['brouillon', 'en_relecture', 'valide', 'programme', 'publie', 'archive']), publishAt: z.iso.datetime({ offset: true }).optional(), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('translate'), id, lang: Lang }),
  z.object({ action: z.literal('restore'), id, revisionId: id }),
  z.object({ action: z.literal('delete'), id }),
]);

type Content = typeof cmsContent.$inferSelect;
const snapshot = (c: Content) => ({ title: c.title, slug: c.slug, excerpt: c.excerpt, category: c.category, country: c.country, blocks: c.blocks, data: c.data, coverId: c.coverId, seoTitle: c.seoTitle, seoDescription: c.seoDescription, featured: c.featured, publishAt: c.publishAt });
async function revise(c: Content, by: string, note?: string) {
  await db.insert(cmsRevision).values({ contentId: c.id, version: c.version, status: c.status, snapshot: snapshot(c), note: note ?? null, authorId: by });
}
const slugTaken = async (type: string, lang: string, slug: string, exceptKey?: string) => {
  const [hit] = await db.select({ key: cmsContent.key }).from(cmsContent).where(and(eq(cmsContent.type, type), eq(cmsContent.lang, lang), eq(cmsContent.slug, slug)));
  return !!hit && hit.key !== exceptKey;
};
/** Identifiant d'URL libre dans la langue (suffixe -2, -3… si besoin). */
async function freeSlug(type: string, base: string, lang: string, exceptKey?: string) {
  for (let i = 1; i < 50; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (!(await slugTaken(type, lang, s, exceptKey))) return s;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}
/** Identifiant court suivant pour un événement (e6…) ou un cours (c9…), sans collision avec le code ni le CMS. */
async function nextShortId(type: 'event' | 'course') {
  const prefix = type === 'event' ? 'e' : 'c';
  const used = [...(type === 'event' ? EVENTS : COURSES).map((x) => x.id), ...(await db.select({ s: cmsContent.slug }).from(cmsContent).where(eq(cmsContent.type, type))).map((r) => r.s)];
  const max = Math.max(0, ...used.map((x) => Number(x.slice(1))).filter(Number.isFinite));
  return `${prefix}${max + 1}`;
}
/** Champs propres au type, vérifiés au moment de publier (un brouillon peut être incomplet). */
function checkData(type: CType, data: unknown): string | null {
  if (type === 'article') return null;
  const r = DATA_SCHEMA[type].safeParse(data);
  return r.success ? null : r.error.issues.map((i) => `${i.path.join('.') || 'fiche'} : ${i.message}`).slice(0, 4).join(' ; ');
}

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide : ' + p.error.issues.map((i) => i.message).join(', '));
  const b = p.data;
  const ip = clientIp(request);
  const u = staffApi(locals.user, 'contenus', b.action === 'create' || b.action === 'import' || b.action === 'translate' ? 'C' : 'M');
  if (u instanceof Response) return u;
  const canValidate = (x: CurrentUser) => can(x.roles, 'contenus', 'V');
  const done = (r: Response) => { invalidateCatalog(); return r; };

  if (b.action === 'create' || b.action === 'import') {
    let values: typeof cmsContent.$inferInsert;
    const base = { key: randomUUID(), type: b.type, authorId: u.id, updatedBy: u.id };
    if (b.action === 'import') {
      if (b.type === 'page') return fail('Les pages se créent directement dans le CMS.');
      const [dup] = await db.select({ id: cmsContent.id }).from(cmsContent).where(and(eq(cmsContent.type, b.type), eq(cmsContent.lang, 'fr'), eq(cmsContent.slug, b.ref)));
      if (dup) return json({ ok: true, redirect: `/admin/cms/${dup.id}`, message: 'Ce contenu est déjà dans le CMS.' });
      if (b.type === 'article') {
        const a = ARTICLES.find((x) => x.id === b.ref);
        if (!a) return fail('Article introuvable.', 404);
        values = { ...base, slug: a.id, lang: 'fr', title: a.t, excerpt: a.x, category: a.cat, country: a.c, featured: !!a.k, blocks: staticArticleBlocks(a) };
      } else {
        const s = b.type === 'event' ? staticEventData(b.ref) : staticCourseData(b.ref);
        if (!s) return fail('Contenu introuvable.', 404);
        values = { ...base, slug: b.ref, lang: 'fr', title: s.title, excerpt: s.excerpt, data: s.data };
      }
    } else if (b.type === 'event' || b.type === 'course') {
      values = { ...base, slug: await nextShortId(b.type), lang: b.lang, title: b.title, data: emptyData[b.type]() };
    } else {
      values = { ...base, slug: await freeSlug(b.type, slugify(b.title), b.lang), lang: b.lang, title: b.title, ...(b.type === 'article' ? { country: 'Panafricain' } : { data: emptyData.page() }) };
    }
    const [c] = await db.insert(cmsContent).values(values).returning();
    await revise(c, u.id, b.action === 'import' ? 'Reprise depuis le site' : 'Création');
    await audit(u.id, `cms.${b.action}`, c.id, { type: c.type, slug: c.slug }, ip);
    return done(json({ ok: true, redirect: `/admin/cms/${c.id}`, message: 'Brouillon créé.' }));
  }

  const [c] = await db.select().from(cmsContent).where(eq(cmsContent.id, b.id));
  if (!c) return fail('Contenu introuvable.', 404);
  const type = c.type as CType;

  switch (b.action) {
    case 'save': {
      if (b.version !== c.version) return fail("Ce contenu a été modifié entre-temps par quelqu'un d'autre. Rechargez la page pour récupérer la dernière version.", 409);
      if ((isLive(c) || c.status === 'valide' || c.status === 'programme') && !canValidate(u)) return fail('Ce contenu est validé ou en ligne : seule une personne habilitée à publier peut le corriger.', 403);
      // Identifiant : libre pour les articles et pages ; fixe pour les événements et cours (billets, paiements, certificats y sont rattachés)
      let slug = c.slug;
      if (type === 'article' || type === 'page') {
        if (!(type === 'page' ? PAGE_SLUG : SLUG).test(b.slug)) return fail(type === 'page' ? 'Adresse : lettres minuscules, chiffres, tirets, et « / » pour une sous-page.' : 'Identifiant d’URL : lettres minuscules, chiffres et tirets.');
        if (b.slug !== c.slug && (await slugTaken(type, c.lang, b.slug, c.key))) return fail('Cette adresse est déjà utilisée.');
        slug = b.slug;
      }
      // Les fiches en ligne doivent rester complètes
      if (isLive(c) || c.status === 'programme') { const err = checkData(type, b.data); if (err) return fail(`Fiche incomplète : ${err}`); }
      if (b.coverId) { const [m] = await db.select({ id: cmsMedia.id }).from(cmsMedia).where(eq(cmsMedia.id, b.coverId)); if (!m) return fail('Image de couverture introuvable.'); }
      const warnings: string[] = [];
      if (type === 'course') {
        const before = (c.data as Partial<CourseData>).lessons?.length ?? 0, after = (b.data as Partial<CourseData>).lessons?.length ?? 0;
        const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(enrollment).where(eq(enrollment.courseId, c.slug));
        if (n?.n && before !== after) warnings.push(`${n.n} apprenant${n.n > 1 ? 's' : ''} inscrit${n.n > 1 ? 's' : ''} : changer le nombre de leçons modifie leur progression.`);
      }
      if (type === 'event') {
        const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(eventTicket).where(eq(eventTicket.eventId, c.slug));
        const names = (d: unknown) => ((d as Partial<EventData>).tickets ?? []).map((t) => `${t.n}:${t.p}`).join('|');
        if (n?.n && names(c.data) !== names(b.data)) warnings.push(`${n.n} billet${n.n > 1 ? 's' : ''} déjà émis : les billets vendus gardent leur catégorie et leur prix d'origine.`);
      }
      const { action: _a, id: _i, version: _v, slug: _s, ...fields } = b;
      const [n] = await db.update(cmsContent).set({ ...fields, slug, version: c.version + 1, updatedBy: u.id, updatedAt: new Date() }).where(and(eq(cmsContent.id, c.id), eq(cmsContent.version, c.version))).returning();
      if (!n) return fail('Conflit de version : rechargez la page.', 409);
      await revise(n, u.id, isLive(c) ? 'Correction après publication' : undefined);
      await audit(u.id, 'cms.save', c.id, { version: n.version }, ip);
      return done(json({ ok: true, version: n.version, message: warnings.length ? `Enregistré. Attention : ${warnings.join(' ')}` : 'Enregistré.' }));
    }
    case 'transition': {
      const t = TRANSITIONS[c.status].find((x) => x.to === b.to);
      if (!t) return fail('Étape impossible depuis l’état actuel.');
      if (t.needs === 'validate' && !canValidate(u)) return fail('Seule une personne habilitée à valider peut faire cette étape.', 403);
      if (b.to === 'programme' && (!b.publishAt || new Date(b.publishAt) <= new Date())) return fail('Choisissez une date de publication à venir.');
      if (b.to === 'publie' || b.to === 'programme' || b.to === 'valide') {
        if (!c.title || (type !== 'event' && type !== 'course' && !(c.blocks as unknown[]).length)) return fail('Un contenu vide ne peut pas être publié.');
        const err = checkData(type, c.data);
        if (err) return fail(`Fiche incomplète : ${err}`);
      }
      const set: Partial<typeof cmsContent.$inferInsert> = { status: b.to as CmsStatus, version: c.version + 1, updatedBy: u.id, updatedAt: new Date() };
      if (b.to === 'programme') set.publishAt = new Date(b.publishAt!);
      if (b.to === 'publie') { set.publishedAt = c.publishedAt ?? new Date(); set.publishAt = null; }
      const [n] = await db.update(cmsContent).set(set).where(eq(cmsContent.id, c.id)).returning();
      await revise(n, u.id, `${t.label}${b.note ? ` — ${b.note}` : ''}`);
      await audit(u.id, `cms.etat.${b.to}`, c.id, { from: c.status, publishAt: set.publishAt ?? null }, ip);
      return done(json({ ok: true, message: `${t.label} : fait.` }));
    }
    case 'translate': {
      if (b.lang === c.lang) return fail('Le contenu est déjà dans cette langue.');
      const [exists] = await db.select({ id: cmsContent.id }).from(cmsContent).where(and(eq(cmsContent.key, c.key), eq(cmsContent.lang, b.lang)));
      if (exists) return json({ ok: true, redirect: `/admin/cms/${exists.id}` });
      // Événements et cours : même identifiant dans toutes les langues ; articles et pages : adresse libre
      const slug = type === 'event' || type === 'course' ? c.slug : await freeSlug(type, c.slug, b.lang, c.key);
      const [n] = await db.insert(cmsContent).values({ ...snapshot(c), publishAt: null, type: c.type, key: c.key, lang: b.lang, slug, authorId: u.id, updatedBy: u.id }).returning();
      await revise(n, u.id, `Version ${b.lang.toUpperCase()} créée à partir de la version ${c.lang.toUpperCase()} (à traduire)`);
      await audit(u.id, 'cms.translate', n.id, { from: c.id }, ip);
      return done(json({ ok: true, redirect: `/admin/cms/${n.id}`, message: 'Version créée : traduisez le texte puis envoyez-la en relecture.' }));
    }
    case 'restore': {
      const [r] = await db.select().from(cmsRevision).where(and(eq(cmsRevision.id, b.revisionId), eq(cmsRevision.contentId, c.id)));
      if (!r) return fail('Version introuvable.', 404);
      const live = isLive(c);
      if (live && !canValidate(u)) return fail('Ce contenu est en ligne : seule une personne habilitée à publier peut restaurer une version.', 403);
      const s = r.snapshot as ReturnType<typeof snapshot>;
      if (live) { const err = checkData(type, s.data); if (err) return fail(`Cette version a une fiche incomplète et ne peut pas remplacer la version en ligne : ${err}`); }
      const parsed = Blocks.safeParse(s.blocks);
      const [n] = await db.update(cmsContent).set({
        title: s.title, excerpt: s.excerpt, category: s.category, country: s.country, blocks: parsed.success ? parsed.data : [], data: s.data ?? c.data, coverId: s.coverId, seoTitle: s.seoTitle, seoDescription: s.seoDescription, featured: s.featured,
        // Un contenu restauré hors ligne revient en rédaction pour repasser la relecture
        status: live ? c.status : 'brouillon', version: c.version + 1, updatedBy: u.id, updatedAt: new Date(),
      }).where(eq(cmsContent.id, c.id)).returning();
      await revise(n, u.id, `Restauration de la version ${r.version}`);
      await audit(u.id, 'cms.restore', c.id, { version: r.version }, ip);
      return done(json({ ok: true, message: `Version ${r.version} restaurée.` }));
    }
    case 'delete': {
      if (!canValidate(u)) return fail('Suppression réservée aux personnes habilitées à publier.', 403);
      if (c.status !== 'brouillon' && c.status !== 'archive') return fail('Archivez le contenu avant de le supprimer.');
      // Un événement ou un cours qui a des billets ou des inscrits reste archivé (traçabilité, vérification des billets et certificats)
      if (type === 'event' || type === 'course') {
        const [n] = type === 'event'
          ? await db.select({ n: sql<number>`count(*)::int` }).from(eventTicket).where(eq(eventTicket.eventId, c.slug))
          : await db.select({ n: sql<number>`count(*)::int` }).from(enrollment).where(eq(enrollment.courseId, c.slug));
        const [sib] = await db.select({ id: cmsContent.id }).from(cmsContent).where(and(eq(cmsContent.key, c.key), ne(cmsContent.id, c.id)));
        if (n?.n && !sib && !(type === 'event' ? EVENTS : COURSES).some((x) => x.id === c.slug)) return fail(`Impossible : ${n.n} ${type === 'event' ? 'billet(s)' : 'inscription(s)'} y sont rattachés. Laissez-le archivé.`);
      }
      await db.delete(cmsContent).where(eq(cmsContent.id, c.id));
      await audit(u.id, 'cms.delete', c.id, { type, slug: c.slug, title: c.title }, ip);
      return done(json({ ok: true, redirect: '/admin/cms', message: 'Contenu supprimé.' }));
    }
  }
};
