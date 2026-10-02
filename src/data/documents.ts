/* Documents téléchargeables (études, dossiers d'appels d'offres, club des actionnaires, kit presse, transparence, boîte à outils).
   Renseigner l'adresse du fichier publié dans DOC_URLS (titre exact → URL) : le bouton devient un téléchargement direct.
   Sans adresse, le bouton enregistre une demande nominative (/api/demande-document) traitée par l'équipe concernée. */
export const CLUB_DOCS = ['Convocation', 'Rapport de gestion 2025', 'Comptes 2025', 'Texte des résolutions'];
export const PRESS_KIT = ['Logos (SVG, PNG)', 'Photos officielles', 'Biographies', "Fiche d'identité"];
export const REPORTS = ['Rapport annuel 2025', "Rapport d'impact 2025", 'États financiers 2025 (résumé)'];
export const POLICIES = ['Charte éthique et anticorruption', 'Politique de protection des données', "Politique de lanceur d'alerte", 'Charte de neutralité politique', "Politique de gestion des conflits d'intérêts", "Politique d'usage de l'intelligence artificielle"];

export const DOC_URLS: Record<string, string> = {};

/** Documents déjà consultables en ligne sur le site (titre exact → page interne). */
export const DOC_PAGES: Record<string, string> = {
  'Politique de protection des données': '/legal/confidentialite',
  "Pacte d'associés type (à adapter)": '/actionnariat/modeles/pacte-associes',
  'Grille de diagnostic de maturité': '/kapital/diagnostic',
  "Rapport d'impact 2025": '/impact',
};
