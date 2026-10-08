/* Catalogue des événements et des cours (CDC §12, CMS) : contenus publiés du CMS + contenus écrits dans le code (src/data).
   Un contenu du CMS remplace celui du code de même identifiant (e1, c3…). Tous les modules sensibles (billetterie, paiements,
   progression, certificats) lisent ce catalogue, jamais les listes du code directement.
   Les identifiants restent courts (e6, c9…) : ils figurent dans les codes de billets, les paiements et les adresses. */
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { cmsContent } from '../db/schema/app';
import { EVENTS, COURSES, country as countryName, money } from '../data/site';
import { EXTRA, type EventExtra } from '../data/events-extra';
import { CONTENT, META, type CourseMeta, type Lesson, type Question } from '../data/course-content';
import { isLive, type Block } from './cms';
import type { KbDoc } from './kb';

/* ----- Données propres à chaque type de contenu (colonne cms_content.data) ----- */
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure au format HH:MM');
const str = (max: number) => z.string().trim().max(max);
// Lien vidéo facultatif : YouTube, Vimeo ou fichier .mp4/.webm en https
const videoUrl = str(500).refine((u) => !u || /^https:\/\/\S+$/.test(u), 'Lien vidéo : adresse en https:// attendue').optional();
export const EventData = z.object({
  city: str(80).min(1, 'Ville requise'),
  country: z.string().length(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date requise'),
  time: hm,
  format: z.enum(['Présentiel', 'En ligne', 'Hybride']),
  big: z.boolean(),
  capacity: z.number().int().min(1).max(100000).nullable(),
  audience: z.array(str(80)).max(20),
  tickets: z.array(z.object({ n: str(80).min(1), p: z.number().int().min(0).max(100_000_000) })).min(1, 'Au moins une catégorie de billet').max(10),
  venue: z.object({ name: str(120), address: str(200), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullable(),
  sessions: z.array(z.object({ day: z.number().int().min(1).max(10), time: hm, title: str(200).min(1), room: str(80), theme: str(60), speakers: z.array(str(80)).max(10) })).max(80),
  speakers: z.array(z.object({ n: str(80).min(1), r: str(120), c: z.string().max(2) })).max(60),
  sponsors: z.array(z.object({ tier: str(40), n: str(80).min(1) })).max(60),
  practical: z.object({ hotels: z.array(str(120)).max(10), visa: str(500) }).nullable(),
});
export const CourseData = z.object({
  theme: str(60).min(1),
  level: z.enum(['Débutant', 'Intermédiaire', 'Avancé']),
  duration: str(30).min(1),
  price: z.number().int().min(0).max(100_000_000),
  by: str(120).min(1),
  langs: z.array(str(30)).min(1).max(8),
  trainer: z.object({ role: str(160), bio: str(600) }),
  trailer: videoUrl,
  lessons: z.array(z.object({ title: str(160).min(1), video: videoUrl, s: str(6000), k: z.array(str(400)).max(12) })).min(1, 'Au moins une leçon').max(40),
  quiz: z.array(z.object({ q: str(400).min(1), o: z.array(str(200).min(1)).min(2).max(6), a: z.number().int().min(0) })).min(1, 'Au moins une question de quiz').max(30)
    .refine((qs) => qs.every((q) => q.a < q.o.length), 'Chaque question doit désigner une bonne réponse existante'),
});
export const PageData = z.object({ layout: z.enum(['site', 'kapital']) });
export type EventData = z.infer<typeof EventData>;
export type CourseData = z.infer<typeof CourseData>;
export const DATA_SCHEMA = { event: EventData, course: CourseData, page: PageData } as const;

/* ----- Formes communes (celles du code, enrichies) ----- */
type StaticEvent = (typeof EVENTS)[number];
type StaticCourse = (typeof COURSES)[number];
export type EventFull = Omit<StaticEvent, 'big'> & { big?: boolean; capacity: number | null; extra: EventExtra | null; body: Block[]; coverId: string | null; fromCms: boolean };
export type CourseFull = StaticCourse & { content: { lessons: Lesson[]; quiz: Question[] }; meta: CourseMeta | undefined; body: Block[]; coverId: string | null; fromCms: boolean };

const CAPACITY: Record<string, number> = { e1: 1250, e2: 120, e3: 500, e4: 40, e5: 80 };

type Row = typeof cmsContent.$inferSelect;
function toEvent(r: Row): EventFull {
  const d = r.data as EventData;
  return {
    id: r.slug, t: r.title, city: d.city, c: d.country, date: d.date, fmt: d.format, big: d.big, d: r.excerpt, sp: d.audience, tk: d.tickets,
    capacity: d.capacity, extra: { venue: d.venue, time: d.time, sessions: d.sessions, speakers: d.speakers, sponsors: d.sponsors, ...(d.practical ? { practical: d.practical } : {}) },
    body: r.blocks as Block[], coverId: r.coverId, fromCms: true,
  };
}
function toCourse(r: Row): CourseFull {
  const d = r.data as CourseData;
  return {
    id: r.slug, t: r.title, th: d.theme, lv: d.level, dur: d.duration, price: d.price, by: d.by, ls: [...d.lessons.map((l) => l.title), 'Quiz final'],
    content: { lessons: d.lessons.map((l) => ({ s: l.s, k: l.k, video: l.video || undefined })), quiz: d.quiz }, meta: { langs: d.langs, trainer: d.trainer, trailer: d.trailer || undefined },
    body: r.blocks as Block[], coverId: r.coverId, fromCms: true,
  };
}
const staticEvent = (e: StaticEvent): EventFull => ({ ...e, capacity: CAPACITY[e.id] ?? null, extra: EXTRA[e.id] ?? null, body: [], coverId: null, fromCms: false });
const staticCourse = (c: StaticCourse): CourseFull => ({ ...c, content: CONTENT[c.id] ?? { lessons: [], quiz: [] }, meta: META[c.id], body: [], coverId: null, fromCms: false });

/* ----- Lecture avec cache court (30 s), vidé à chaque modification du CMS ----- */
const cache = new Map<string, { at: number; rows: Row[] }>();
export const invalidateCatalog = () => cache.clear();
async function cmsRows(type: 'event' | 'course', lang: 'fr' | 'en'): Promise<Row[]> {
  const k = `${type}:${lang}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 30_000) return hit.rows;
  const rows = await db.select().from(cmsContent).where(and(eq(cmsContent.type, type), inArray(cmsContent.lang, ['fr', lang]))).catch(() => [] as Row[]);
  cache.set(k, { at: Date.now(), rows });
  return rows;
}
/** Une ligne par identifiant : version en ligne dans la langue demandée, sinon en français ; hidden = aussi les contenus hors ligne. */
function pick(rows: Row[], lang: string, hidden: boolean) {
  const out = new Map<string, Row>();
  const rank = (r: Row) => (isLive(r) ? 2 : 0) + (r.lang === lang ? 1 : 0);
  for (const r of rows) {
    if (!hidden && !isLive(r)) continue;
    const cur = out.get(r.slug);
    if (!cur || rank(r) > rank(cur)) out.set(r.slug, r);
  }
  return out;
}

type Opts = { lang?: 'fr' | 'en'; hidden?: boolean };
/** Fusion CMS + code. Un élément du code s'efface quand sa version du CMS est en ligne ou archivée (dépublication) ;
    pendant la rédaction de sa reprise, il reste affiché. hidden : versions du CMS hors ligne incluses (billets vendus, vérifications). */
async function merged<S extends { id: string }, F>(type: 'event' | 'course', o: Opts, statics: readonly S[], fromStatic: (s: S) => F, fromRow: (r: Row) => F) {
  const lang = o.lang ?? 'fr';
  const rows = await cmsRows(type, lang);
  const cms = pick(rows, lang, !!o.hidden);
  const masked = new Set(rows.filter((r) => isLive(r) || r.status === 'archive' || (o.hidden && cms.has(r.slug))).map((r) => r.slug));
  return [...[...cms.values()].map(fromRow), ...statics.filter((x) => !masked.has(x.id)).map(fromStatic)];
}
/** Événements visibles (CMS + code), triés par date. */
export async function allEvents(o: Opts = {}): Promise<EventFull[]> {
  return (await merged('event', o, EVENTS, staticEvent, toEvent)).sort((a, b) => a.date.localeCompare(b.date));
}
export async function findEvent(id: string, o: Opts = {}) {
  return (await allEvents(o)).find((e) => e.id === id) ?? null;
}
/** Cours visibles (CMS + code). */
export async function allCourses(o: Opts = {}): Promise<CourseFull[]> {
  return (await merged('course', o, COURSES, staticCourse, toCourse)).sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }));
}
export async function findCourse(id: string, o: Opts = {}) {
  return (await allCourses(o)).find((c) => c.id === id) ?? null;
}

/* ----- Reprise d'un contenu du code dans le CMS ----- */
export function staticEventData(id: string): { title: string; excerpt: string; data: EventData } | null {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) return null;
  const x = EXTRA[id];
  return {
    title: e.t, excerpt: e.d,
    data: {
      city: e.city, country: e.c, date: e.date, time: x?.time ?? '09:00', format: e.fmt as EventData['format'], big: !!('big' in e && e.big), capacity: CAPACITY[id] ?? null,
      audience: e.sp, tickets: e.tk, venue: x?.venue ?? null, sessions: x?.sessions ?? [], speakers: x?.speakers ?? [], sponsors: x?.sponsors ?? [], practical: x?.practical ?? null,
    },
  };
}
export function staticCourseData(id: string): { title: string; excerpt: string; data: CourseData } | null {
  const c = COURSES.find((x) => x.id === id);
  if (!c) return null;
  const content = CONTENT[id], meta = META[id];
  return {
    title: c.t, excerpt: '',
    data: {
      theme: c.th, level: c.lv as CourseData['level'], duration: c.dur, price: c.price, by: c.by, langs: meta?.langs ?? ['Français'], trainer: meta?.trainer ?? { role: '', bio: '' }, trailer: meta?.trailer ?? '',
      lessons: c.ls.slice(0, -1).map((t, i) => ({ title: t, video: content?.lessons[i]?.video ?? '', s: content?.lessons[i]?.s ?? '', k: content?.lessons[i]?.k ?? [] })),
      quiz: content?.quiz ?? [],
    },
  };
}
/** Données de départ d'un nouveau contenu (le circuit exige ensuite de compléter la fiche avant publication). */
export const emptyData = {
  event: (): EventData => ({ city: 'Lomé', country: 'TG', date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), time: '09:00', format: 'Présentiel', big: false, capacity: null, audience: [], tickets: [{ n: 'Entrée', p: 0 }], venue: null, sessions: [], speakers: [], sponsors: [], practical: null }),
  course: (): CourseData => ({ theme: 'Création', level: 'Débutant', duration: '1 h', price: 0, by: '', langs: ['Français'], trainer: { role: '', bio: '' }, lessons: [{ title: 'Leçon 1', s: '', k: [] }], quiz: [{ q: 'Question', o: ['Réponse A', 'Réponse B'], a: 0 }] }),
  page: () => ({ layout: 'site' as const }),
};

/* ----- Base de connaissances de CEA Copilot : événements et cours publiés depuis le CMS ----- */
export async function catalogKbDocs(): Promise<KbDoc[]> {
  const evs = (await allEvents()).filter((e) => e.fromCms);
  const crs = (await allCourses()).filter((c) => c.fromCms);
  return [
    ...evs.map((e) => ({ id: `evt:${e.id}`, kind: 'Événement', title: e.t, url: `/evenements/${e.id}`, text: `${e.t} — ${e.date}, ${e.city} (${countryName(e.c)}), format ${e.fmt}. ${e.d} Billets : ${e.tk.map((t) => `${t.n} ${money(t.p)}`).join(', ')}.` })),
    ...crs.map((c) => ({ id: `cours:${c.id}`, kind: "Cours de l'Académie", title: c.t, url: `/academie/${c.id}`, text: `Cours « ${c.t} » (thème ${c.th}, niveau ${c.lv}, durée ${c.dur}, ${money(c.price)}), par ${c.by}. Leçons : ${c.ls.slice(0, -1).join(' ; ')}.` })),
  ];
}
