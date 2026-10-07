/* Méga-menu du portail CEA FOR AFRICA : 8 entrées (CDC §6), chacune avec ses sous-rubriques et un contenu mis en avant. */
import type { L } from '../i18n/ui';

/** live: 'calls' → lien et description remplacés par les appels à candidatures réellement ouverts (src/lib/calls.ts › megaLive). */
export type MegaItem = { href: string; ic: string; t: L; d: L; badge?: L; live?: 'calls' };
export type Feature = 'president' | 'quiz' | 'call' | 'course' | 'mastermind' | 'forum' | 'jobs' | 'study';
export type Mega = { k: string; label: L; href: string; match: string[]; cols: { h: L; items: MegaItem[] }[]; feat: Feature };

const i = (href: string, ic: string, t: L, d: L, badge?: L): MegaItem => ({ href, ic, t, d, badge });

export const MEGA: Mega[] = [
  {
    k: 'apropos', label: { fr: 'À propos', en: 'About' }, href: '/a-propos', feat: 'president',
    match: ['/a-propos', '/pays', '/contact'],
    cols: [
      { h: { fr: "L'organisation", en: 'The organisation' }, items: [
        i('/a-propos', 'info', { fr: 'Qui sommes-nous', en: 'Who we are' }, { fr: 'Vision, mission, valeurs, histoire', en: 'Vision, mission, values, history' }),
        i('/a-propos/gouvernance', 'gov', { fr: 'Gouvernance', en: 'Governance' }, { fr: 'Conseil, comités, équipe, experts', en: 'Board, committees, team, experts' }),
        i('/a-propos/transparence', 'shield', { fr: 'Transparence', en: 'Transparency' }, { fr: 'Rapports annuels et politiques', en: 'Annual reports and policies' }),
      ] },
      { h: { fr: 'Partout en Afrique', en: 'Across Africa' }, items: [
        i('/pays', 'globe', { fr: 'Présence en Afrique', en: 'Presence in Africa' }, { fr: '16 pays, une page par antenne', en: '16 countries, one page per office' }),
        i('/a-propos/presse', 'press', { fr: 'Presse et kit média', en: 'Press and media kit' }, { fr: 'Communiqués, logos, interviews', en: 'Releases, logos, interviews' }),
        i('/a-propos/carrieres', 'job', { fr: 'Carrières chez CEA', en: 'Careers at CEA' }, { fr: 'Rejoindre nos équipes', en: 'Join our teams' }),
        i('/contact', 'mail', { fr: 'Contact', en: 'Contact' }, { fr: 'Une équipe par pays et par sujet', en: 'One team per country and topic' }),
      ] },
    ],
  },
  {
    k: 'domaines', label: { fr: 'Nos domaines', en: 'What we do' }, href: '/domaines', feat: 'quiz',
    match: ['/domaines', '/actionnariat', '/projets'],
    cols: [
      { h: { fr: 'Se développer', en: 'Grow' }, items: [
        i('/actionnariat', 'cap', { fr: 'Actionnariat', en: 'Shareholding' }, { fr: 'Shareholder Academy, studio de capital', en: 'Shareholder Academy, equity studio' }),
        i('/kapital', 'fund', { fr: 'Levée de fonds', en: 'Fundraising' }, { fr: 'Via CEA Kapital Invest', en: 'Through CEA Kapital Invest' }, { fr: 'Kapital', en: 'Kapital' }),
        i('/projets', 'proj', { fr: 'Développement de projets', en: 'Project development' }, { fr: 'CEA Project Studio', en: 'CEA Project Studio' }),
        i('/evenements', 'event', { fr: 'Événements', en: 'Events' }, { fr: 'Forums et rencontres d\'affaires', en: 'Forums and business meetings' }),
      ] },
      { h: { fr: 'Grandir ensemble', en: 'Grow together' }, items: [
        i('/opportunites', 'job', { fr: "Création d'emplois", en: 'Job creation' }, { fr: 'CEA Talents', en: 'CEA Talents' }),
        i('/communaute/mastermind', 'circle', { fr: 'Mastermind', en: 'Mastermind' }, { fr: 'Cercles confidentiels de dirigeants', en: 'Confidential leader circles' }),
        i('/academie', 'learn', { fr: 'Accompagnement et formation', en: 'Support and training' }, { fr: 'CEA Academy et Accelerator', en: 'CEA Academy and Accelerator' }),
        i('/voix', 'voice', { fr: 'Action syndicale', en: 'Advocacy' }, { fr: 'Voix des Entrepreneurs', en: "Entrepreneurs' Voice" }),
      ] },
    ],
  },
  {
    k: 'programmes', label: { fr: 'Programmes', en: 'Programmes' }, href: '/programmes', feat: 'call',
    match: ['/programmes'],
    cols: [
      { h: { fr: 'Nos programmes', en: 'Our programmes' }, items: [
        i('/programmes', 'rocket', { fr: 'Pré-incubation, incubation, accélération', en: 'Pre-incubation, incubation, acceleration' }, { fr: "De l'idée à la croissance", en: 'From idea to growth' }),
        i('/kapital/investor-ready', 'fund', { fr: "Préparation à l'investissement", en: 'Investment readiness' }, { fr: 'Programme Investor Ready', en: 'Investor Ready programme' }),
        i('/programmes#sectoriels', 'globe', { fr: 'Programmes sectoriels et pays', en: 'Sector and country programmes' }, { fr: 'Agritech, femmes, diaspora…', en: 'Agritech, women, diaspora…' }),
      ] },
      { h: { fr: 'Candidater', en: 'Apply' }, items: [
        { ...i('/programmes', 'star', { fr: 'Appels à candidatures ouverts', en: 'Open calls' }, { fr: 'Les appels en cours et leurs dates', en: 'Current calls and their dates' }), live: 'calls' },
        i('/programmes/calendrier', 'event', { fr: 'Calendrier', en: 'Calendar' }, { fr: 'Toutes les dates des appels', en: 'All call dates' }),
        i('/programmes/alumni', 'users', { fr: 'Anciens (alumni)', en: 'Alumni' }, { fr: 'Le réseau des anciens', en: 'The alumni network' }),
      ] },
    ],
  },
  {
    k: 'academie', label: { fr: 'Académie', en: 'Academy' }, href: '/academie', feat: 'course',
    match: ['/academie', '/espace'],
    cols: [
      { h: { fr: 'Apprendre', en: 'Learn' }, items: [
        i('/academie', 'learn', { fr: 'Catalogue de cours', en: 'Course catalogue' }, { fr: '8 cours, 4 gratuits', en: '8 courses, 4 free' }),
        i('/academie/parcours', 'star', { fr: 'Parcours certifiants', en: 'Certified paths' }, { fr: 'Certificats vérifiables', en: 'Verifiable certificates' }),
        i('/academie/masterclass', 'video', { fr: 'Masterclass', en: 'Masterclasses' }, { fr: 'Leçons de grands dirigeants', en: 'Lessons from top leaders' }),
      ] },
      { h: { fr: 'Outils et suivi', en: 'Tools and progress' }, items: [
        i('/ressources/outils', 'tool', { fr: 'Bibliothèque de modèles', en: 'Template library' }, { fr: 'Business plan, pitch, contrats', en: 'Business plan, pitch, contracts' }),
        i('/academie/experts', 'users', { fr: 'Experts à la demande', en: 'Experts on demand' }, { fr: 'Consultations courtes', en: 'Short consultations' }),
        i('/espace/apprentissage', 'book', { fr: 'Mon apprentissage', en: 'My learning' }, { fr: 'Cours et certificats', en: 'Courses and certificates' }),
      ] },
    ],
  },
  {
    k: 'communaute', label: { fr: 'Communauté', en: 'Community' }, href: '/communaute', feat: 'mastermind',
    match: ['/communaute', '/adherer', '/voix'],
    cols: [
      { h: { fr: 'Le réseau', en: 'The network' }, items: [
        i('/adherer', 'hand', { fr: 'Rejoindre / adhérer', en: 'Join / become a member' }, { fr: 'Formules et carte de membre', en: 'Plans and membership card' }),
        i('/communaute', 'users', { fr: 'Annuaire des membres', en: 'Member directory' }, { fr: 'Trouver la bonne personne', en: 'Find the right person' }),
        i('/communaute/espaces', 'globe', { fr: 'Espaces thématiques et pays', en: 'Topic and country spaces' }, { fr: 'Par pays, secteur, profil', en: 'By country, sector, profile' }),
      ] },
      { h: { fr: 'Progresser et peser', en: 'Progress and be heard' }, items: [
        i('/communaute/mastermind', 'circle', { fr: 'Mastermind Circles', en: 'Mastermind Circles' }, { fr: 'Cercles confidentiels', en: 'Confidential circles' }),
        i('/communaute/mentorat', 'star', { fr: 'Mentorat', en: 'Mentoring' }, { fr: 'Mentors vérifiés', en: 'Verified mentors' }),
        i('/voix', 'voice', { fr: 'Voix des Entrepreneurs', en: "Entrepreneurs' Voice" }, { fr: 'Consultations et plaidoyer', en: 'Consultations and advocacy' }),
      ] },
    ],
  },
  {
    k: 'evenements', label: { fr: 'Événements', en: 'Events' }, href: '/evenements', feat: 'forum',
    match: ['/evenements'],
    cols: [
      { h: { fr: 'Participer', en: 'Attend' }, items: [
        i('/evenements', 'event', { fr: 'Agenda', en: 'Calendar' }, { fr: 'Tous les événements', en: 'All events' }),
        i('/evenements/e1', 'star', { fr: 'Forum panafricain CEA', en: 'CEA Pan-African Forum' }, { fr: '26 – 28 novembre, Lomé', en: '26 – 28 November, Lomé' }, { fr: 'Billetterie', en: 'Tickets' }),
        i('/evenements?type=Masterclass+et+ateliers', 'learn', { fr: 'Masterclass et ateliers', en: 'Masterclasses and workshops' }, { fr: 'Formats pratiques', en: 'Hands-on formats' }),
      ] },
      { h: { fr: 'Rencontrer et revoir', en: 'Meet and replay' }, items: [
        i('/evenements?type=Rencontres+investisseurs', 'fund', { fr: 'Rencontres investisseurs', en: 'Investor meetings' }, { fr: 'Avec CEA Kapital Invest', en: 'With CEA Kapital Invest' }),
        i('/evenements/replays', 'video', { fr: 'Replays', en: 'Replays' }, { fr: 'Vidéothèque chapitrée', en: 'Chaptered video library' }),
        i('/evenements/organiser', 'tool', { fr: 'Organiser avec nous', en: 'Organise with us' }, { fr: 'Sponsors, exposants, antennes', en: 'Sponsors, exhibitors, offices' }),
      ] },
    ],
  },
  {
    k: 'opps', label: { fr: 'Opportunités', en: 'Opportunities' }, href: '/opportunites', feat: 'jobs',
    match: ['/opportunites', '/projets/competences'],
    cols: [
      { h: { fr: 'Trouver', en: 'Find' }, items: [
        i('/opportunites', 'job', { fr: "Offres d'emploi", en: 'Jobs' }, { fr: 'Offres vérifiées', en: 'Verified offers' }),
        i('/opportunites/stages', 'cap', { fr: 'Stages et alternance', en: 'Internships and work-study' }, { fr: 'Étudiants et jeunes diplômés', en: 'Students and graduates' }),
        i('/opportunites/missions', 'tool', { fr: 'Missions et appels à consultants', en: 'Missions and consultant calls' }, { fr: 'Freelance et expertise', en: 'Freelance and expertise' }),
        i('/opportunites/appels-offres', 'doc', { fr: "Appels d'offres et marchés", en: 'Tenders and contracts' }, { fr: 'Marchés et prestations', en: 'Contracts and services' }),
      ] },
      { h: { fr: 'Contribuer', en: 'Contribute' }, items: [
        i('/projets/competences', 'proj', { fr: 'Projets à rejoindre', en: 'Projects to join' }, { fr: 'Appels à compétences', en: 'Skills calls' }),
        i('/opportunites/recruteur', 'users', { fr: 'Publier une offre', en: 'Post a job' }, { fr: 'Espace recruteur', en: 'Recruiter space' }),
        i('/opportunites/diaspora', 'globe', { fr: 'Diaspora', en: 'Diaspora' }, { fr: "Contribuer depuis l'étranger", en: 'Contribute from abroad' }),
      ] },
    ],
  },
  {
    k: 'ressources', label: { fr: 'Ressources', en: 'Resources' }, href: '/ressources', feat: 'study',
    match: ['/ressources', '/impact'],
    cols: [
      { h: { fr: "S'informer", en: 'Stay informed' }, items: [
        i('/ressources', 'press', { fr: 'Média et actualités', en: 'Media and news' }, { fr: 'Analyses, histoires, communiqués', en: 'Analysis, stories, releases' }),
        i('/ressources/etudes', 'chart', { fr: 'Études et rapports', en: 'Studies and reports' }, { fr: "Baromètres, rapports d'impact", en: 'Barometers, impact reports' }),
        i('/ressources/podcasts', 'mic', { fr: 'Podcasts et vidéos', en: 'Podcasts and videos' }, { fr: 'Écouter, regarder', en: 'Listen, watch' }),
      ] },
      { h: { fr: 'Outils et données', en: 'Tools and data' }, items: [
        i('/ressources/outils', 'tool', { fr: 'Boîte à outils', en: 'Toolbox' }, { fr: 'Modèles à télécharger', en: 'Downloadable templates' }),
        i('/impact', 'globe', { fr: "Observatoire d'impact", en: 'Impact observatory' }, { fr: 'Données sourcées et ouvertes', en: 'Sourced, open data' }),
        i('/ressources/glossaire', 'book', { fr: 'Glossaire', en: 'Glossary' }, { fr: "Les mots de l'entrepreneuriat", en: 'The language of entrepreneurship' }),
      ] },
    ],
  },
];

/** Entrée du méga-menu active pour un chemin donné. */
export function megaOf(path: string): string | null {
  const p = path.replace(/\/$/, '') || '/';
  let best: { k: string; n: number } | null = null;
  for (const m of MEGA) for (const pre of m.match) if ((p === pre || p.startsWith(pre + '/')) && (!best || pre.length > best.n)) best = { k: m.k, n: pre.length };
  return best?.k ?? null;
}

/** Réseaux sociaux du pied de page : les adresses se renseignent dans le back-office (Administration système) ;
    aucune icône n'est affichée tant que l'adresse est vide. */
export const SOCIAL: { k: 'linkedin' | 'facebook' | 'x' | 'youtube' | 'instagram' | 'tiktok' | 'whatsapp'; n: string; path: string }[] = [
  { k: 'linkedin', n: 'LinkedIn', path: 'M4 9h4v11H4zM6 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h3.8v1.6c.6-1 1.9-1.9 3.7-1.9 3.6 0 4.3 2.3 4.3 5.4V20h-4v-5.2c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V20h-4z' },
  { k: 'facebook', n: 'Facebook', path: 'M14 8h3V4h-3c-2.8 0-4 1.8-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.7-.6z' },
  { k: 'x', n: 'X', path: 'M4 4l7 9-7 7h2l6-6 5 6h4l-7-9 6-7h-2l-5 5-4-5z' },
  { k: 'youtube', n: 'YouTube', path: 'M22 8.2a3 3 0 0 0-2-2C18 5.7 12 5.7 12 5.7s-6 0-8 .5a3 3 0 0 0-2 2A31 31 0 0 0 1.7 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2 2c2 .5 8 .5 8 .5s6 0 8-.5a3 3 0 0 0 2-2 31 31 0 0 0 .3-3.8 31 31 0 0 0-.3-3.8zM10 15V9l5 3z' },
  { k: 'instagram', n: 'Instagram', path: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.5-4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z' },
  { k: 'tiktok', n: 'TikTok', path: 'M16 3c.4 2.3 1.9 3.8 4 4v3.2c-1.5 0-2.9-.4-4-1.2V15a6 6 0 1 1-6-6v3.3a2.8 2.8 0 1 0 2.8 2.7V3z' },
  { k: 'whatsapp', n: 'WhatsApp', path: 'M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2s-1 .3-3.4-.7a11.6 11.6 0 0 1-4.5-4c-.4-.5-1-1.6-1-2.6s.6-1.6.8-1.8.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6a8.7 8.7 0 0 0 4 3.5c.3.2.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.4a2.3 2.3 0 0 1 0 1.1z' },
];
