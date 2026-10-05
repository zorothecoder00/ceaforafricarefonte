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
  | 'paiements' | 'messages_contact' | 'interrupteurs' | 'controle_acces' | 'crm' | 'campagnes';

type Rights = string; // sous-ensemble de 'LCMV', suffixe '*' = limité aux éléments propres / assignés
type Matrix = Partial<Record<Obj, Rights>>;

/* Extrait §18.1 complété pour les objets du back-office. */
export const MATRIX: Record<Role, Matrix> = {
  membre: { contenus: 'L', profil: 'LM*', candidature: 'C' },
  entrepreneur: { contenus: 'L', profil: 'LM*', fiche_projet: 'LCM*', candidature: 'LCM*', notes_mentorat: 'L*', dossier_kapital: 'LCM*', data_room: 'LCM*', decision_comite: 'L*', pieces_kyc: 'C' },
  talent: { contenus: 'L', profil: 'LM*', candidature: 'LCM*' },
  employeur: { contenus: 'L', profil: 'LM*', offre_emploi: 'LCM*', candidature: 'LM*' },
  mentor: { contenus: 'L', profil: 'LM*', fiche_projet: 'L*', notes_mentorat: 'LCM*' },
  investisseur: { contenus: 'L', profil: 'LM*', fiche_projet: 'L*', dossier_kapital: 'L*', data_room: 'L*', pieces_kyc: 'C' },
  souscripteur: { contenus: 'L', profil: 'LM*' },
  partenaire: { contenus: 'L', profil: 'LM*' },
  charge_programme: { contenus: 'L', profil: 'L*', fiche_projet: 'LMV', candidature: 'LMV', notes_mentorat: 'L*', membres: 'L', controle_acces: 'LV', crm: 'LCM' },
  analyste: { contenus: 'L', profil: 'L*', fiche_projet: 'L', dossier_kapital: 'LM', data_room: 'L', decision_comite: 'L' },
  comite: { contenus: 'L', fiche_projet: 'L', dossier_kapital: 'L', data_room: 'L', decision_comite: 'CV' },
  conformite: { contenus: 'L', pieces_kyc: 'LMV', dossier_kapital: 'L', membres: 'L', journal_audit: 'L' },
  editeur: { contenus: 'LCMV', moderation: 'LMV', offre_emploi: 'LMV', messages_contact: 'LM', campagnes: 'LCM' },
  responsable_pays: { contenus: 'LCM*', membres: 'L*', messages_contact: 'LM*', moderation: 'LM*', controle_acces: 'LV', crm: 'LCM*', campagnes: 'L' },
  admin: { contenus: 'LCMV', profil: 'L', fiche_projet: 'L', candidature: 'L', dossier_kapital: 'L', decision_comite: 'L', journal_audit: 'L', membres: 'LCMV', parametres: 'LCMV', paiements: 'L', messages_contact: 'LM', moderation: 'LMV', offre_emploi: 'LMV', interrupteurs: 'LMV', controle_acces: 'LV', crm: 'LCMV', campagnes: 'LCMV' },
  direction: { crm: 'L', campagnes: 'L', contenus: 'L', profil: 'L', candidature: 'L', dossier_kapital: 'L', decision_comite: 'LV', journal_audit: 'L', membres: 'L', paiements: 'L', interrupteurs: 'L' },
};

export type Action = 'L' | 'C' | 'M' | 'V';
export type Scope = 'all' | 'own';

/** Portée accordée pour (rôles, objet, action) : 'all', 'own' (éléments propres/assignés) ou null (refus). */
export function scope(roles: readonly string[], obj: Obj, action: Action): Scope | null {
  let best: Scope | null = null;
  for (const r of roles) {
    const rights = MATRIX[r as Role]?.[obj];
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
