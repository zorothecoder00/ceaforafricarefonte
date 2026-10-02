/* Traductions de l'interface (en-tête, pied de page, éléments communs) et outils de localisation. */

export type Lang = 'fr' | 'en';
export const LANGS: Lang[] = ['fr', 'en'];
export type L = Record<Lang, string>;

export const getLang = (locale: string | undefined): Lang => (locale === 'en' ? 'en' : 'fr');

/** Préfixe un chemin interne selon la langue : /academie → /en/academie. */
export function lp(lang: Lang, path: string): string {
  if (lang === 'fr' || !path.startsWith('/') || path.startsWith('/en/') || path === '/en') return path;
  return path === '/' ? '/en/' : '/en' + path;
}

/** Retire le préfixe de langue d'un chemin. */
export const stripLang = (path: string) => path.replace(/^\/en(?=\/|$)/, '') || '/';

/** Réécrit les liens internes d'un fragment HTML vers la version anglaise. */
export function localizeHtml(html: string, lang: Lang): string {
  if (lang === 'fr') return html;
  return html.replace(/(href|action)="\/(?!en\/|en"|_astro\/|icons\/|media\/|favicon|manifest|sw\.js|\/)/g, '$1="/en/');
}

/** Pages réellement traduites en anglais (les autres affichent un bandeau « page en français »). */
export const TRANSLATED = new Set(['/', '/commencer', '/plan-du-site', '/connexion', '/signalement', '/hors-ligne']);

const ui = {
  proto: { fr: "Prototype fonctionnel — toutes les données sont fictives, aucun paiement ni investissement réel n'est effectué.", en: 'Working prototype — all data is fictitious; no real payment or investment takes place.' },
  skip: { fr: 'Aller au contenu', en: 'Skip to content' },
  home: { fr: 'Accueil', en: 'Home' },
  brandHome: { fr: 'CEA FOR AFRICA, accueil', en: 'CEA FOR AFRICA, home' },
  search: { fr: 'Rechercher (Ctrl+K ou /)', en: 'Search (Ctrl+K or /)' },
  login: { fr: 'Se connecter', en: 'Sign in' },
  join: { fr: 'Rejoindre', en: 'Join' },
  menu: { fr: 'Ouvrir le menu', en: 'Open menu' },
  close: { fr: 'Fermer', en: 'Close' },
  mainNav: { fr: 'Navigation principale', en: 'Main navigation' },
  seeAll: { fr: 'Tout voir', en: 'See all' },
  locTitle: { fr: 'Pays, langue et devise', en: 'Country, language and currency' },
  country: { fr: 'Pays', en: 'Country' },
  language: { fr: 'Langue', en: 'Language' },
  currency: { fr: "Devise d'affichage", en: 'Display currency' },
  otherCountry: { fr: 'Autre pays', en: 'Other country' },
  rateNote: { fr: 'Conversion indicative. Taux du 30/09/2026 — parité fixe BCEAO/BEAC pour le FCFA, taux de marché indicatifs pour les autres devises.', en: 'Indicative conversion. Rates as of 30/09/2026 — fixed BCEAO/BEAC peg for CFA francs, indicative market rates for other currencies.' },
  langSoon: { fr: 'Portugais et arabe : prévus en V2. Kiswahili : V3.', en: 'Portuguese and Arabic: planned for V2. Kiswahili: V3.' },
  apply: { fr: 'Appliquer', en: 'Apply' },
  notTranslated: { fr: '', en: 'This page has not been translated yet — the French version is shown below.' },
  // pied de page
  fkTitle: { fr: 'Votre entreprise mérite des investisseurs. Préparez votre levée avec nous.', en: 'Your company deserves investors. Prepare your fundraising with us.' },
  fkDiag: { fr: 'Faire le diagnostic gratuit', en: 'Take the free diagnostic' },
  fkInv: { fr: 'Devenir investisseur', en: 'Become an investor' },
  tagline: { fr: 'Connecter · Entreprendre · Agir. La plateforme des entrepreneurs africains, de Dakar à Nairobi.', en: 'Connect · Build · Act. The platform for African entrepreneurs, from Dakar to Nairobi.' },
  theme: { fr: 'Thème clair / sombre', en: 'Light / dark theme' },
  lite: { fr: 'Mode Lite', en: 'Lite mode' },
  textSize: { fr: 'Taille du texte', en: 'Text size' },
  sitemap: { fr: 'Plan du site', en: 'Site map' },
  platform: { fr: 'Plateforme', en: 'Platform' },
  trust: { fr: 'Confiance et aide', en: 'Trust & help' },
  contact: { fr: 'Contact', en: 'Contact' },
  privacy: { fr: 'Confidentialité', en: 'Privacy' },
  cookies: { fr: 'Cookies', en: 'Cookies' },
  terms: { fr: "Conditions d'utilisation", en: 'Terms of use' },
  a11y: { fr: 'Accessibilité', en: 'Accessibility' },
  help: { fr: "Centre d'aide", en: 'Help centre' },
  report: { fr: 'Signaler un contenu ou une fraude', en: 'Report content or fraud' },
  status: { fr: 'Statut de la plateforme', en: 'Platform status' },
  start: { fr: 'Par où commencer ?', en: 'Where to start?' },
  newsletter: { fr: "Lettre d'information", en: 'Newsletter' },
  nlLead: { fr: 'Une lettre par mois, selon vos intérêts et votre pays.', en: 'One email a month, tailored to your interests and country.' },
  nlBtn: { fr: "S'abonner", en: 'Subscribe' },
  nlOk: { fr: 'Inscription confirmée. Un e-mail de vérification vous a été envoyé.', en: 'Subscription confirmed. A verification email has been sent.' },
  countries: { fr: 'Contacts par pays', en: 'Country contacts' },
  follow: { fr: 'Nous suivre', en: 'Follow us' },
  rights: { fr: '© 2026 CEA FOR AFRICA — chiffres et contenus de démonstration.', en: '© 2026 CEA FOR AFRICA — demonstration figures and content.' },
  // Copilot
  copSub: { fr: 'Assistant de la plateforme', en: 'Platform assistant' },
  copHello: { fr: 'Bonjour ! Je suis CEA Copilot. Je peux vous orienter vers une formation, un programme, un événement ou CEA Kapital Invest.', en: 'Hello! I am CEA Copilot. I can point you to a course, a programme, an event or CEA Kapital Invest.' },
  copAsk: { fr: 'Posez votre question…', en: 'Ask your question…' },
  send: { fr: 'Envoyer', en: 'Send' },
  sugg: { fr: 'Comment lever des fonds ?|Cours gratuits|Prochain événement|Investir', en: 'How do I raise funds?|Free courses|Next event|Invest' },
  searchPh: { fr: 'Cours, événement, offre, opportunité, pays…', en: 'Course, event, job, opportunity, country…' },
} satisfies Record<string, L>;

export type UIKey = keyof typeof ui;
export const useT = (lang: Lang) => (k: UIKey) => ui[k][lang];
