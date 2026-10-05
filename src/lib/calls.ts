/* Appels à candidatures (CDC §12) : programmes historiques écrits dans le code + appels créés dans le back-office.
   Un appel en base de même identifiant que un programme du code le remplace (dates, formulaire, grille). */
import { eq } from 'drizzle-orm';
import { db } from './db';
import { programmeCall } from '../db/schema/programmes';
import { callState, Fields, Grid, DEFAULT_GRID, type CallState } from './programmes';

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

export type Programme = { slug: string; label: string; prefix: string; role?: Role; state: CallState; fields: Fields | null; grid: Grid; callId: string | null; reviewsPerApp: number };

const prefixOf = (slug: string) => slug.split('-').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 4) || 'APP';

/** Programme visé par une candidature : appel en base s'il existe, sinon programme historique (toujours ouvert). */
export async function resolveProgramme(slug: string): Promise<Programme | null> {
  const [c] = await db.select().from(programmeCall).where(eq(programmeCall.slug, slug)).catch(() => []);
  const legacy = LEGACY[slug];
  if (c) {
    const fields = Fields.safeParse(c.fields);
    const grid = Grid.safeParse(c.grid);
    return {
      slug, label: c.title, prefix: legacy?.prefix ?? prefixOf(slug), role: (c.role as Role | null) ?? legacy?.role, state: callState(c),
      fields: fields.success && fields.data.length ? fields.data : null, grid: grid.success ? grid.data : DEFAULT_GRID, callId: c.id, reviewsPerApp: c.reviewsPerApp,
    };
  }
  return legacy ? { slug, ...legacy, state: 'ouvert', fields: null, grid: DEFAULT_GRID, callId: null, reviewsPerApp: 2 } : null;
}

/** Appels publiés (ouverts ou à venir, puis clos récents), pour les pages publiques et le calendrier. */
export async function publicCalls() {
  const rows = await db.select().from(programmeCall).catch(() => []);
  return rows.map((c) => ({ ...c, state: callState(c) })).filter((c) => c.state === 'ouvert' || c.state === 'a_venir' || c.state === 'clos')
    .sort((a, b) => (a.closesAt?.getTime() ?? 0) - (b.closesAt?.getTime() ?? 0));
}
/** Page de candidature d'un appel : formulaire codé pour les programmes historiques, page générique sinon. */
export const applyPath = (slug: string) => (slug === 'accelerateur-c4' ? '/programmes/candidature' : slug === 'investor-ready' ? '/kapital/investor-ready' : `/programmes/appel/${slug}`);
