import { COUNTRIES, MENU, KMENU } from './proto';

export * from './proto';

export type Link = [href: string, label: string];

/** Navigation principale (barre sous l'en-tête). */
export const NAV: [key: string, href: string, label: string][] = [
  ['apropos', '/a-propos', 'À propos'],
  ['domaines', '/domaines', 'Domaines'],
  ['programmes', '/programmes', 'Programmes'],
  ['academie', '/academie', 'Académie'],
  ['projets', '/projets', 'Projets'],
  ['communaute', '/communaute', 'Communauté'],
  ['evenements', '/evenements', 'Événements'],
  ['opps', '/opportunites', 'Opportunités'],
  ['voix', '/voix', 'Voix des entrepreneurs'],
  ['ressources', '/ressources', 'Ressources'],
];

/** Sous-navigation de chaque rubrique. */
export const SUBS: Record<string, Link[]> = {
  apropos: [['/a-propos', 'Qui sommes-nous'], ['/a-propos/gouvernance', 'Gouvernance'], ['/pays', 'Présence en Afrique'], ['/a-propos/transparence', 'Transparence'], ['/a-propos/presse', 'Presse'], ['/a-propos/carrieres', 'Carrières'], ['/contact', 'Contact']],
  domaines: [['/domaines', 'Tous les domaines'], ['/actionnariat', 'Actionnariat']],
  programmes: [['/programmes', 'Tous les programmes'], ['/programmes/accelerateur', 'Accélérateur'], ['/programmes/calendrier', 'Calendrier'], ['/programmes/alumni', 'Alumni'], ['/programmes/candidature', 'Postuler'], ['/kapital/investor-ready', 'Investor Ready']],
  academie: [['/academie', 'Catalogue'], ['/academie/parcours', 'Parcours certifiants'], ['/academie/masterclass', 'Masterclass'], ['/academie/experts', 'Experts à la demande'], ['/communaute/mentorat', 'Mentorat']],
  projets: [['/projets', 'Portefeuille'], ['/projets/competences', 'Appels à compétences']],
  communaute: [['/communaute', 'Annuaire'], ['/communaute/fil', "Fil d'actualité"], ['/communaute/espaces', 'Espaces'], ['/communaute/mentorat', 'Mentorat'], ['/communaute/mastermind', 'Mastermind'], ['/adherer', 'Adhérer']],
  evenements: [['/evenements', 'Agenda'], ['/evenements/e1', 'Forum 2026'], ['/evenements/replays', 'Replays'], ['/evenements/organiser', 'Organiser avec nous']],
  opps: [['/opportunites', 'Emplois et stages'], ['/opportunites/appels-offres', "Appels d'offres"], ['/projets/competences', 'Projets à rejoindre'], ['/opportunites/entreprises', 'Entreprises'], ['/opportunites/diaspora', 'Diaspora']],
  voix: [['/voix', 'Consultations'], ['/voix/positions', 'Nos positions'], ['/adherer', 'Adhérer']],
  ressources: [['/ressources', 'Média'], ['/ressources/etudes', 'Études'], ['/ressources/podcasts', 'Podcasts et vidéos'], ['/ressources/outils', 'Boîte à outils'], ['/ressources/glossaire', 'Glossaire'], ['/impact', "Observatoire d'impact"]],
};

/** Rubrique active d'après le chemin. */
export function sectionOf(path: string): string | null {
  const p = path.replace(/\/$/, '') || '/';
  if (p.startsWith('/kapital')) return 'kapital';
  for (const [k, links] of Object.entries(SUBS)) if (links.some(([h]) => h !== '/contact' && (p === h || p.startsWith(h + '/')))) return k;
  const hit = NAV.find(([, h]) => p === h || p.startsWith(h + '/'));
  return hit ? hit[0] : null;
}

/** Tous les liens présents dans les menus (pour générer les pages « bientôt disponibles »). */
export function allMenuLinks(): { href: string; title: string; desc: string; kapital: boolean }[] {
  const out = new Map<string, { href: string; title: string; desc: string; kapital: boolean }>();
  const add = (menu: any[], kapital: boolean) =>
    menu.forEach((m) => m.cols.forEach((c: any) => c.items.forEach((it: string[]) => {
      const href = it[0].split('#')[0];
      if (!out.has(href)) out.set(href, { href, title: it[2], desc: it[3], kapital });
    })));
  add(MENU, false);
  add(KMENU, true);
  Object.values(SUBS).flat().forEach(([href, title]) => { if (!out.has(href)) out.set(href, { href, title, desc: '', kapital: false }); });
  return [...out.values()];
}

/* ===== Marchés (séries fictives générées de façon déterministe) ===== */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = Math.imul(48271, s) % 2147483647) & 2147483647) / 2147483647;
}
export const MARKETS = [
  { id: 'brvm', n: 'BRVM Composite', ex: 'BRVM', zone: 'UEMOA', base: 285, city: 'Abidjan', reg: 'AMF-UMOA', co: 46, cur: 'XOF' },
  { id: 'jse', n: 'JSE All Share', ex: 'JSE', zone: 'Afrique du Sud', base: 86000, city: 'Johannesburg', reg: 'FSCA', co: 300, cur: 'ZAR' },
  { id: 'ngx', n: 'NGX All-Share', ex: 'NGX', zone: 'Nigeria', base: 98000, city: 'Lagos', reg: 'SEC Nigeria', co: 150, cur: 'NGN' },
  { id: 'nse', n: 'NSE 20', ex: 'NSE', zone: 'Kenya', base: 1900, city: 'Nairobi', reg: 'CMA', co: 60, cur: 'KES' },
  { id: 'masi', n: 'MASI', ex: 'Bourse de Casablanca', zone: 'Maroc', base: 14500, city: 'Casablanca', reg: 'AMMC', co: 75, cur: 'MAD' },
  { id: 'egx', n: 'EGX 30', ex: 'EGX', zone: 'Égypte', base: 31000, city: 'Le Caire', reg: 'FRA', co: 220, cur: 'EGP' },
  { id: 'gse', n: 'GSE Composite', ex: 'GSE', zone: 'Ghana', base: 5200, city: 'Accra', reg: 'SEC Ghana', co: 35, cur: 'GHS' },
  { id: 'bvmac', n: 'BVMAC (indicatif)', ex: 'BVMAC', zone: 'CEMAC', base: 1000, city: 'Douala', reg: 'COSUMAF', co: 10, cur: 'XAF' },
].map((m, i) => {
  const r = seeded(97 + i * 13);
  let v = m.base;
  const series: number[] = [];
  for (let k = 0; k < 90; k++) { v = v * (1 + (r() - 0.48) * 0.018); series.push(+v.toFixed(2)); }
  return { ...m, series, last: series[89], ch: (series[89] / series[88] - 1) * 100 };
});

/* ===== Formatage ===== */
export const fmt = (n: number) => Number(n).toLocaleString('fr-FR');
export const money = (xof: number, free = 'Gratuit') => (xof ? Math.round(xof).toLocaleString('fr-FR') + ' FCFA' : free);
export const dateFr = (d: string, opts: Intl.DateTimeFormatOptions = {}) => new Date(d).toLocaleDateString('fr-FR', opts);
export const country = (c: string) => COUNTRIES[c] ?? c;
export const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);

/** Encarts promotionnels Kapital Invest. */
export const KADS = [
  ['Vous préparez une levée ?', 'Faites le diagnostic Investor Ready gratuit : 8 questions, un score sur 100 et vos priorités.', '/kapital/diagnostic', 'Faire le diagnostic'],
  ["Investissez dans l'Afrique qui entreprend", 'Des opportunités vérifiées par nos analystes, avec data room sécurisée.', '/kapital/opportunites', 'Voir les opportunités'],
  ['Suivez les bourses africaines', 'BRVM, JSE, NGX, NSE : indices, sociétés cotées et portefeuille virtuel.', '/kapital/marches', 'Ouvrir le tableau'],
];

export const KRISK =
  "Investir dans des entreprises non cotées comporte un risque de perte totale du capital et un risque d'illiquidité. Les informations présentées ne constituent ni une offre ni un conseil en investissement. Ce prototype n'effectue aucune opération financière.";
