/* Catalogue des programmes écrit dans le code (src/data PROGS), sans base de données : état calculé d'après les dates.
   Utilisé seul par l'orientation et la base de connaissances, et complété par les appels du back-office dans src/lib/calls.ts. */
import type { CallState } from './programmes';
import { PROGS } from '../data/site';

/** Page de candidature d'un appel : formulaire codé pour les programmes historiques, page générique sinon. */
export const applyPath = (slug: string) => (slug === 'accelerateur-c4' ? '/programmes/candidature' : slug === 'investor-ready' ? '/kapital/investor-ready' : `/programmes/appel/${slug}`);

const SLUG_OF: Record<string, string> = {
  'Pré-incubation': 'pre-incubation', Incubation: 'incubation', 'Accélérateur — Cohorte 4': 'accelerateur-c4', 'Investor Ready': 'investor-ready',
  'Femmes entrepreneures': 'femmes-entrepreneures', 'Diaspora Connect': 'diaspora-connect', 'Agritech Sahel': 'agritech-sahel',
};
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Programmes du catalogue qui ont un formulaire de candidature (les autres proposent « Être prévenu »). */
const CODED_FORM = new Set(['accelerateur-c4', 'investor-ready']);

export type CatalogueItem = {
  slug: string; title: string; programme: string; duration: string | null; description: string;
  state: Exclude<CallState, 'brouillon' | 'archive'>; opensAt: Date | null; closesAt: Date | null;
  href: string; canApply: boolean; source: 'appel' | 'catalogue';
};

/** Programmes du code : ouverts jusqu'à leur date de clôture (fin de journée GMT), sinon « prochaine session » à leur date d'ouverture. */
export function staticProgrammes(now = new Date()): CatalogueItem[] {
  return (PROGS as unknown as [string, string, string, boolean, string][]).map(([title, duration, description, open, date]) => {
    const slug = SLUG_OF[title] ?? slugify(title);
    const closesAt = open ? new Date(`${date}T23:59:59Z`) : null;
    const opensAt = open ? null : new Date(`${date}T00:00:00Z`);
    const state: CatalogueItem['state'] = open ? (now <= closesAt! ? 'ouvert' : 'clos') : 'a_venir';
    const canApply = state === 'ouvert' && CODED_FORM.has(slug);
    return { slug, title, programme: title, duration, description, state, opensAt, closesAt, href: canApply ? applyPath(slug) : '/programmes', canApply, source: 'catalogue' };
  });
}
