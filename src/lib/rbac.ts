/* Rôles et matrice des droits (CDC §18).
   L = lecture · C = création · M = modification · V = validation.
   « Propre » (own) : l'accès porte sur les éléments de l'utilisateur ; « assigné » : éléments explicitement partagés ou assignés.
   Les contrôles fins (propriété, assignation, partage) sont faits dans le code appelant à l'aide de ces règles. */

export const ROLES = [
  'membre', 'entrepreneur', 'talent', 'employeur', 'mentor', 'investisseur', 'souscripteur', 'partenaire',
  'charge_programme', 'analyste', 'comite', 'conformite', 'editeur', 'responsable_pays', 'admin', 'direction',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  membre: 'Membre', entrepreneur: 'Entrepreneur', talent: 'Talent', employeur: 'Employeur', mentor: 'Mentor / formateur',
  investisseur: 'Investisseur', souscripteur: 'Souscripteur (LP)', partenaire: 'Partenaire', charge_programme: 'Chargé de programme',
  analyste: 'Analyste Kapital', comite: 'Membre du comité', conformite: 'Responsable conformité', editeur: 'Éditeur / modérateur',
  responsable_pays: 'Responsable pays', admin: 'Administrateur', direction: 'Direction / audit',
};

/** Rôles dont l'accès exige la double authentification (CDC §10, §14). */
export const SENSITIVE: Role[] = ['charge_programme', 'analyste', 'comite', 'conformite', 'editeur', 'responsable_pays', 'admin', 'direction'];

/** Rôles qui accèdent au back-office « CEA OS ». */
export const STAFF: Role[] = SENSITIVE;

export type Obj =
  | 'contenus' | 'profil' | 'fiche_projet' | 'candidature' | 'notes_mentorat' | 'dossier_kapital' | 'data_room'
  | 'decision_comite' | 'pieces_kyc' | 'journal_audit' | 'offre_emploi' | 'moderation' | 'membres' | 'parametres'
  | 'paiements' | 'messages_contact' | 'interrupteurs' | 'controle_acces' | 'crm' | 'campagnes' | 'programmes' | 'rapports' | 'formulaires' | 'automatisations' | 'documents';

type Rights = string; // sous-ensemble de 'LCMV', suffixe '*' = limité aux éléments propres / assignés
type Matrix = Partial<Record<Obj, Rights>>;

/* Extrait §18.1 complété pour les objets du back-office.
   Écart assumé au §18.1 (décision du 2026-10-06) : l'administrateur gère les fiches projet (LCMV au lieu de L) pour créer et supprimer des projets. */
export const MATRIX: Record<Role, Matrix> = {
  membre: { contenus: 'L', profil: 'LM*', candidature: 'C' },
  entrepreneur: { contenus: 'L', profil: 'LM*', fiche_projet: 'LCM*', candidature: 'LCM*', notes_mentorat: 'L*', dossier_kapital: 'LCM*', data_room: 'LCM*', decision_comite: 'L*', pieces_kyc: 'C' },
  talent: { contenus: 'L', profil: 'LM*', candidature: 'LCM*' },
  employeur: { contenus: 'L', profil: 'LM*', offre_emploi: 'LCM*', candidature: 'LM*' },
  mentor: { contenus: 'L', profil: 'LM*', fiche_projet: 'L*', notes_mentorat: 'LCM*' },
  investisseur: { contenus: 'L', profil: 'LM*', fiche_projet: 'L*', dossier_kapital: 'L*', data_room: 'L*', pieces_kyc: 'C' },
  souscripteur: { contenus: 'L', profil: 'LM*' },
  partenaire: { contenus: 'L', profil: 'LM*' },
  charge_programme: { contenus: 'L', profil: 'L*', fiche_projet: 'LMV', candidature: 'LMV', notes_mentorat: 'L*', membres: 'L', controle_acces: 'LV', crm: 'LCM', programmes: 'LCMV', rapports: 'LC', formulaires: 'LCM', documents: 'L*' },
  analyste: { contenus: 'L', profil: 'L*', fiche_projet: 'L', dossier_kapital: 'LM', data_room: 'L', decision_comite: 'L', documents: 'L*' },
  comite: { contenus: 'L', fiche_projet: 'L', dossier_kapital: 'L', data_room: 'L', decision_comite: 'CV', documents: 'L*' },
  conformite: { contenus: 'L', pieces_kyc: 'LMV', dossier_kapital: 'L', membres: 'L', journal_audit: 'L', documents: 'L*' },
  editeur: { contenus: 'LCMV', moderation: 'LMV', offre_emploi: 'LCMV', messages_contact: 'LM', campagnes: 'LCM', formulaires: 'LCMV', documents: 'L*' },
  responsable_pays: { contenus: 'LCM*', membres: 'L*', messages_contact: 'LM*', moderation: 'LM*', controle_acces: 'LV', crm: 'LCM*', campagnes: 'L', programmes: 'L', rapports: 'L*', formulaires: 'L', documents: 'L*' },
  admin: { contenus: 'LCMV', profil: 'L', fiche_projet: 'LCMV', candidature: 'L', dossier_kapital: 'L', decision_comite: 'L', journal_audit: 'L', membres: 'LCMV', parametres: 'LCMV', paiements: 'LCMV', messages_contact: 'LM', moderation: 'LMV', offre_emploi: 'LCMV', interrupteurs: 'LMV', controle_acces: 'LV', crm: 'LCMV', campagnes: 'LCMV', programmes: 'LCMV', rapports: 'LCMV', formulaires: 'LCMV', automatisations: 'LCMV', documents: 'LCMV' },
  direction: { crm: 'L', campagnes: 'L', programmes: 'L', rapports: 'LC', contenus: 'L', profil: 'L', candidature: 'L', dossier_kapital: 'L', decision_comite: 'LV', journal_audit: 'L', membres: 'L', paiements: 'L', interrupteurs: 'L', formulaires: 'L', automatisations: 'L', documents: 'L*' },
};

export type Action = 'L' | 'C' | 'M' | 'V';
export type Scope = 'all' | 'own';
export const OBJ_LABEL: Record<Obj, string> = {
  contenus: 'Contenus publics', profil: 'Profil personnel', fiche_projet: 'Fiche projet', candidature: 'Candidature programme',
  notes_mentorat: 'Notes de mentorat', dossier_kapital: 'Dossier Kapital', data_room: 'Data room', decision_comite: 'Décision de comité',
  pieces_kyc: 'Pièces KYC', journal_audit: "Journal d'audit", offre_emploi: "Offre d'emploi", moderation: 'Modération',
  membres: 'Membres et rôles', parametres: 'Paramétrage', paiements: 'Paiements', messages_contact: 'Messages de contact', interrupteurs: 'Interrupteurs par pays', controle_acces: "Contrôle d'accès aux événements",
  crm: 'CRM (contacts, organisations, pipeline)', campagnes: 'Campagnes (e-mail, SMS, WhatsApp, push)', programmes: 'Appels, jurys, cohortes et suivi', rapports: 'Rapports et exports', formulaires: 'Formulaires sans code', automatisations: 'Workflows et automatisations', documents: 'Gestion documentaire (droits par dossier)',
};
export const OBJS = Object.keys(OBJ_LABEL) as Obj[];

/* ===== Matrice modifiable (back-office › Matrice des droits) =====
   La matrice ci-dessus est la valeur par défaut (cahier des charges) ; les écarts enregistrés en base sont chargés par le
   middleware (src/lib/rights.ts) et appliqués ici. Certaines cases restent verrouillées. */
export type RightsOverrides = Partial<Record<Role, Partial<Record<Obj, string>>>>;
let OVERRIDES: RightsOverrides = {};
export const setRightsOverrides = (o: RightsOverrides) => { OVERRIDES = o; };

/** Droits effectifs d'un rôle sur un objet (« » = aucun accès). */
export function rightsOf(role: Role, obj: Obj): string {
  if (lockReason(role, obj)) return MATRIX[role]?.[obj] ?? '';
  const o = OVERRIDES[role];
  return o && obj in o ? o[obj]! : MATRIX[role]?.[obj] ?? '';
}

/** Cases non modifiables : garde-fous du cahier des charges et protection contre le blocage du back-office. */
export function lockReason(role: Role, obj: Obj): string | null {
  if (role === 'admin' && (obj === 'membres' || obj === 'parametres')) return "L'administrateur garde la gestion des membres et du paramétrage (évite de bloquer le back-office).";
  if (obj === 'pieces_kyc') return 'Les pièces KYC ne sont lisibles que par le responsable conformité (CDC §18).';
  if (obj === 'journal_audit') return "Le journal d'audit est en ajout seul : seule la lecture peut être accordée, par le code.";
  return null;
}

/** Valeur de droits valide : lettres dans l'ordre L, C, M, V, « * » facultatif ; normalisée. */
export function normRights(v: string): string | null {
  const m = /^([LCMV]*)(\*?)$/.exec(v.toUpperCase().replace(/\s/g, ''));
  if (!m) return null;
  const letters = 'LCMV'.split('').filter((c) => m[1].includes(c)).join('');
  return letters ? letters + m[2] : '';
}

/** Portée accordée pour (rôles, objet, action) : 'all', 'own' (éléments propres/assignés) ou null (refus). */
export function scope(roles: readonly string[], obj: Obj, action: Action): Scope | null {
  let best: Scope | null = null;
  for (const r of roles) {
    const rights = (ROLES as readonly string[]).includes(r) ? rightsOf(r as Role, obj) : '';
    if (!rights || !rights.includes(action)) continue;
    if (!rights.endsWith('*')) return 'all';
    best = 'own';
  }
  return best;
}

export const can = (roles: readonly string[], obj: Obj, action: Action) => scope(roles, obj, action) !== null;
export const hasRole = (roles: readonly string[], ...wanted: Role[]) => wanted.some((w) => roles.includes(w));
export const isStaff = (roles: readonly string[]) => roles.some((r) => STAFF.includes(r as Role));
export const needs2fa = (roles: readonly string[]) => roles.some((r) => SENSITIVE.includes(r as Role));
