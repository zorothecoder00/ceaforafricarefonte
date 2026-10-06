/* Bandeau de chiffres de l'accueil : modifiable dans Administration système › Chiffres de l'accueil ;
   tant que rien n'est enregistré, ce sont les valeurs ci-dessous qui s'affichent. */
import { getSetting } from './settings';
import { HUBS } from '../data/site';

export type HomeStat = { value: string; fr: string; en: string };

export const DEFAULT_STATS = (): HomeStat[] => [
  { value: HUBS.reduce((a, h) => a + h.m, 0).toLocaleString('fr-FR'), fr: 'membres inscrits', en: 'registered members' },
  { value: String(HUBS.reduce((a, h) => a + h.p, 0)), fr: 'projets accompagnés', en: 'projects supported' },
  { value: '2 340', fr: 'emplois créés et vérifiés', en: 'jobs created and verified' },
  { value: String(HUBS.length), fr: 'pays actifs', en: 'active countries' },
];
export const DEFAULT_NOTE = { fr: 'Chiffres de démonstration, au 30 septembre 2026.', en: 'Demonstration figures, as of 30 September 2026.' };

/** Chiffres et phrase de source à afficher (réglages enregistrés, sinon valeurs par défaut). */
export async function homeStats() {
  const s = await getSetting('chiffres_accueil').catch(() => null);
  const saved = !!s?.items.length;
  return {
    items: saved ? s!.items : DEFAULT_STATS(),
    noteFr: saved ? s!.noteFr : DEFAULT_NOTE.fr,
    noteEn: saved ? s!.noteEn : DEFAULT_NOTE.en,
    methodology: s?.methodology ?? true,
    saved,
  };
}
