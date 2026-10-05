/* Mise en relation avec score expliqué (CDC §11) : entrepreneur–mentor et offre–talent.
   Les scores sont calculés par des règles publiques et déterministes, chaque point est justifié par un facteur affiché.
   Garde-fous contre les biais (testés dans tests/matching.test.ts) : ni le genre, ni le pays d'origine de la personne,
   ni son nom n'entrent dans le calcul ; le pays ne compte que comme lieu de travail d'une offre (présentiel). */
import { norm } from './fuzzy';

export type Factor = { label: string; points: number; max: number };
export type Match = { score: number; factors: Factor[] };

const words = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const total = (factors: Factor[]): Match => ({ score: Math.round(factors.reduce((n, f) => n + f.points, 0)), factors });

/** Entrepreneur → mentor : besoins couverts par l'expertise (45), secteur (25), langue commune (20), satisfaction des séances (10). */
export function mentorMatch(
  me: { sector?: string | null; needs?: string | null; lang?: string | null },
  m: { expertise: string; sectors: string[]; languages: string[]; rating?: number | null },
): Match {
  const need = words(me.needs ?? ''), exp = words(`${m.expertise} ${m.sectors.join(' ')}`);
  const common = [...need].filter((w) => [...exp].some((e) => e.startsWith(w.slice(0, 5)) || w.startsWith(e.slice(0, 5))));
  const needPts = need.size ? Math.min(45, Math.round((45 * common.length) / Math.min(need.size, 4))) : 0;
  const sector = !!me.sector && m.sectors.some((s) => norm(s).includes(norm(me.sector!)) || norm(me.sector!).includes(norm(s)));
  const langWord = me.lang === 'en' ? 'ang' : 'fr';
  const lang = m.languages.some((l) => norm(l).startsWith(langWord) || norm(l).startsWith(me.lang === 'en' ? 'eng' : 'fra'));
  const rating = m.rating ? Math.max(0, Math.min(10, Math.round(((m.rating / 10 - 3) / 2) * 10))) : 5; // sans avis : neutre
  return total([
    { label: need.size ? `Besoins couverts par son expertise${common.length ? ` (${common.slice(0, 3).join(', ')})` : ''}` : 'Besoins non renseignés dans votre profil', points: needPts, max: 45 },
    { label: sector ? 'Même secteur' : 'Autre secteur', points: sector ? 25 : 0, max: 25 },
    { label: lang ? 'Langue commune' : 'Pas de langue commune déclarée', points: lang ? 20 : 0, max: 20 },
    { label: m.rating ? `Satisfaction des séances (${(m.rating / 10).toFixed(1)}/5)` : 'Pas encore d’avis (neutre)', points: rating, max: 10 },
  ]);
}

/** Talent → offre : compétences demandées que vous avez (80), lieu de travail compatible (20). */
export function jobMatch(me: { skills: string[]; country?: string | null }, j: { skills: string[]; c: string; remote: boolean }): Match {
  const have = new Set(me.skills.map(norm));
  const hit = j.skills.filter((s) => have.has(norm(s)));
  const place = j.remote || (!!me.country && me.country === j.c);
  return total([
    { label: `${hit.length}/${j.skills.length} compétences demandées`, points: j.skills.length ? (80 * hit.length) / j.skills.length : 0, max: 80 },
    { label: j.remote ? 'Télétravail possible' : place ? 'Poste dans votre pays' : 'Poste dans un autre pays', points: place ? 20 : 0, max: 20 },
  ]);
}

