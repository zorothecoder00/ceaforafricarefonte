/* Appels à candidatures (CDC §12) : catalogue des programmes écrit dans le code (src/data PROGS) + appels créés dans le back-office.
   Source unique pour les pages publiques, le calendrier, l'API et les candidatures :
   - un appel en base de même identifiant qu'un programme du catalogue le remplace dès qu'il n'est plus en brouillon ;
   - sans appel, un programme du catalogue suit ses dates (ouvert jusqu'à sa date de clôture, sinon « prochaine session »). */
import { eq } from 'drizzle-orm';
import { db } from './db';
import { programmeCall } from '../db/schema/programmes';
import { callState, Fields, Grid, DEFAULT_GRID, type CallState } from './programmes';
import { staticProgrammes, applyPath, type CatalogueItem } from './catalogue';

export { staticProgrammes, applyPath, type CatalogueItem };

type Role = 'entrepreneur';
/** Programmes historiques (formulaires codés, ex. l'assistant en étapes de l'Accélérateur). */
export const LEGACY: Record<string, { label: string; prefix: string; role?: Role }> = {
  'accelerateur-c4': { label: 'Accélérateur — Cohorte 4', prefix: 'CAND', role: 'entrepreneur' },
  'investor-ready': { label: 'Programme Investor Ready', prefix: 'IR', role: 'entrepreneur' },
  mastermind: { label: 'Mastermind Circles', prefix: 'MM' },
  'femmes-entrepreneures': { label: 'Femmes entrepreneures', prefix: 'FE', role: 'entrepreneur' },
  'diaspora-connect': { label: 'Diaspora Connect', prefix: 'DC' },
  'agritech-sahel': { label: 'Agritech Sahel', prefix: 'AS', role: 'entrepreneur' },
};

/** Libellés lisibles des réponses des formulaires codés (back-office). */
export const LEGACY_FIELD_LABELS: Record<string, string> = {
  nom: 'Nom complet', tel: 'Téléphone', pays: 'Pays', genre: 'Genre', entreprise: "Nom de l'entreprise", secteur: 'Secteur', salaries: 'Nombre de salariés',
  immat: 'Entreprise immatriculée', probleme: 'Problème résolu', attentes: 'Attentes', source: 'Origine de la candidature', cohorte: 'Cohorte visée',
  stade: 'Stade', langue: 'Langue', format: 'Format', concurrents: 'Concurrents à éviter',
};

/** Catalogue complet : appels publiés du back-office + programmes du code qui n'ont pas d'appel (hors brouillon). */
export async function programmeCatalogue(now = new Date()): Promise<CatalogueItem[]> {
  const rows = await db.select().from(programmeCall).catch(() => []);
  const replaced = new Set(rows.filter((c) => c.status !== 'brouillon').map((c) => c.slug));
  const calls: CatalogueItem[] = rows.map((c) => ({ c, state: callState(c, now) }))
    .filter((x): x is { c: typeof x.c; state: CatalogueItem['state'] } => x.state !== 'brouillon' && x.state !== 'archive')
    .map(({ c, state }) => ({ slug: c.slug, title: c.title, programme: c.programme, duration: null, description: c.description, state, opensAt: c.opensAt, closesAt: c.closesAt, href: applyPath(c.slug), canApply: state === 'ouvert', source: 'appel' as const }));
  const order = { ouvert: 0, a_venir: 1, clos: 2 };
  return [...calls, ...staticProgrammes(now).filter((p) => !replaced.has(p.slug))]
    .sort((a, b) => order[a.state] - order[b.state] || ((a.closesAt ?? a.opensAt)?.getTime() ?? Infinity) - ((b.closesAt ?? b.opensAt)?.getTime() ?? Infinity));
}

/** Un programme du catalogue (ou appel) par identifiant. */
export async function catalogueItem(slug: string) {
  return (await programmeCatalogue()).find((p) => p.slug === slug) ?? null;
}

export type Programme = { slug: string; label: string; prefix: string; role?: Role; state: CallState; fields: Fields | null; grid: Grid; callId: string | null; reviewsPerApp: number };

const prefixOf = (slug: string) => slug.split('-').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 4) || 'APP';

/** Programme visé par une candidature : appel en base (hors brouillon d'un programme historique), sinon programme historique
    selon ses dates du catalogue (Mastermind, sans date, reste ouvert en continu). */
export async function resolveProgramme(slug: string): Promise<Programme | null> {
  const [c] = await db.select().from(programmeCall).where(eq(programmeCall.slug, slug)).catch(() => []);
  const legacy = LEGACY[slug];
  if (c && !(c.status === 'brouillon' && legacy)) {
    const fields = Fields.safeParse(c.fields);
    const grid = Grid.safeParse(c.grid);
    return {
      slug, label: c.title, prefix: legacy?.prefix ?? prefixOf(slug), role: (c.role as Role | null) ?? legacy?.role, state: callState(c),
      fields: fields.success && fields.data.length ? fields.data : null, grid: grid.success ? grid.data : DEFAULT_GRID, callId: c.id, reviewsPerApp: c.reviewsPerApp,
    };
  }
  if (!legacy) return null;
  const item = staticProgrammes().find((p) => p.slug === slug);
  return { slug, ...legacy, state: item?.state ?? 'ouvert', fields: null, grid: DEFAULT_GRID, callId: null, reviewsPerApp: 2 };
}

/** Appels publiés (ouverts ou à venir, puis clos récents), pour les pages publiques et le calendrier. */
export async function publicCalls() {
  const rows = await db.select().from(programmeCall).catch(() => []);
  return rows.map((c) => ({ ...c, state: callState(c) })).filter((c) => c.state === 'ouvert' || c.state === 'a_venir' || c.state === 'clos')
    .sort((a, b) => (a.closesAt?.getTime() ?? 0) - (b.closesAt?.getTime() ?? 0));
}
