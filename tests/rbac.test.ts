/* Conformité de la matrice des droits au cahier des charges (CDC §18.1).
   Chaque cellule de l'extrait du CDC est vérifiée : les droits listés sont accordés, les autres refusés.
   Le code peut être plus strict (portée « éléments propres ») mais jamais plus permissif. */
import { describe, expect, it } from 'vitest';
import { MATRIX, ROLES, SENSITIVE, STAFF, can, scope, isStaff, needs2fa, type Obj, type Role, type Action } from '../src/lib/rbac';

const ACTIONS: Action[] = ['L', 'C', 'M', 'V'];

// Extrait §18.1 du CDC v2.0 (page 78). '' = aucun accès (—).
const CDC: Partial<Record<Obj, Partial<Record<Role, string>>>> = {
  contenus: { membre: 'L', entrepreneur: 'L', mentor: 'L', investisseur: 'L', charge_programme: 'L', analyste: 'L', comite: 'L', admin: 'LCMV' },
  profil: { membre: 'LM', entrepreneur: 'LM', mentor: 'LM', investisseur: 'LM', charge_programme: 'L', analyste: 'L', comite: '', admin: 'L' },
  // Écart assumé au §18.1 : l'administrateur gère les fiches projet (L dans le cahier des charges)
  fiche_projet: { membre: '', entrepreneur: 'LCM', mentor: 'L', investisseur: 'L', charge_programme: 'LMV', analyste: 'L', comite: 'L', admin: 'LCMV' },
  candidature: { membre: 'C', entrepreneur: 'LCM', mentor: '', investisseur: '', charge_programme: 'LMV', analyste: '', comite: '', admin: 'L' },
  notes_mentorat: { membre: '', entrepreneur: 'L', mentor: 'LCM', investisseur: '', charge_programme: 'L', analyste: '', comite: '', admin: '' },
  dossier_kapital: { membre: '', entrepreneur: 'LCM', mentor: '', investisseur: 'L', charge_programme: '', analyste: 'LM', comite: 'L', admin: 'L' },
  data_room: { membre: '', entrepreneur: 'LCM', mentor: '', investisseur: 'L', charge_programme: '', analyste: 'L', comite: 'L', admin: '' },
  decision_comite: { membre: '', entrepreneur: 'L', mentor: '', investisseur: '', charge_programme: '', analyste: 'L', comite: 'CV', admin: 'L' },
  pieces_kyc: { membre: '', entrepreneur: 'C', mentor: '', investisseur: 'C', charge_programme: '', analyste: '', comite: '', admin: '' },
  journal_audit: { membre: '', entrepreneur: '', mentor: '', investisseur: '', charge_programme: '', analyste: '', comite: '', admin: 'L' },
};

describe('Matrice des droits — extrait CDC §18.1', () => {
  for (const [obj, row] of Object.entries(CDC) as [Obj, Partial<Record<Role, string>>][]) {
    for (const [role, rights] of Object.entries(row) as [Role, string][]) {
      it(`${role} × ${obj} = ${rights || '—'}`, () => {
        for (const a of ACTIONS) expect(can([role], obj, a), `${role} ${obj} ${a}`).toBe(rights.includes(a));
      });
    }
  }
});

describe('Règles particulières', () => {
  it('les pièces KYC ne sont lisibles que par le responsable conformité', () => {
    const readers = ROLES.filter((r) => can([r], 'pieces_kyc', 'L'));
    expect(readers).toEqual(['conformite']);
  });

  it("le journal d'audit n'est modifiable par personne", () => {
    for (const r of ROLES) for (const a of ['C', 'M', 'V'] as Action[]) expect(can([r], 'journal_audit', a)).toBe(false);
  });

  it("moindre privilège : l'administrateur ne lit ni les data rooms, ni les pièces KYC, ni les notes de mentorat", () => {
    expect(can(['admin'], 'data_room', 'L')).toBe(false);
    expect(can(['admin'], 'pieces_kyc', 'L')).toBe(false);
    expect(can(['admin'], 'notes_mentorat', 'L')).toBe(false);
  });

  it('seul le comité crée et valide les décisions de comité (la direction approuve)', () => {
    const creators = ROLES.filter((r) => can([r], 'decision_comite', 'C'));
    expect(creators).toEqual(['comite']);
    expect(ROLES.filter((r) => can([r], 'decision_comite', 'V')).sort()).toEqual(['comite', 'direction']);
  });

  it('un visiteur sans rôle n’a aucun droit', () => {
    for (const obj of Object.keys(CDC) as Obj[]) for (const a of ACTIONS) expect(can([], obj, a)).toBe(false);
  });

  it('un rôle inconnu est ignoré', () => {
    expect(can(['pirate'], 'contenus', 'L')).toBe(false);
    expect(scope(['pirate', 'membre'], 'contenus', 'L')).toBe('all');
  });
});

describe('Portée : éléments propres ou tous', () => {
  it('les droits marqués * sont limités aux éléments propres ou assignés', () => {
    expect(scope(['entrepreneur'], 'dossier_kapital', 'L')).toBe('own');
    expect(scope(['investisseur'], 'data_room', 'L')).toBe('own');
    expect(scope(['mentor'], 'fiche_projet', 'L')).toBe('own');
    expect(scope(['responsable_pays'], 'membres', 'L')).toBe('own');
  });

  it('le cumul de rôles retient la portée la plus large', () => {
    expect(scope(['entrepreneur', 'analyste'], 'dossier_kapital', 'L')).toBe('all');
    expect(scope(['analyste', 'entrepreneur'], 'dossier_kapital', 'L')).toBe('all');
  });

  it('toute valeur de la matrice est un sous-ensemble de LCMV, éventuellement suivi de *', () => {
    for (const r of ROLES) for (const v of Object.values(MATRIX[r])) expect(v).toMatch(/^[LCMV]+\*?$/);
  });
});

describe('Back-office et double authentification', () => {
  it('les rôles sensibles exigent la double authentification (CDC §10, §14)', () => {
    for (const r of ['charge_programme', 'analyste', 'comite', 'conformite', 'editeur', 'responsable_pays', 'admin', 'direction'] as Role[]) expect(needs2fa([r])).toBe(true);
    for (const r of ['membre', 'entrepreneur', 'talent', 'employeur', 'mentor', 'investisseur', 'souscripteur', 'partenaire'] as Role[]) expect(needs2fa([r])).toBe(false);
  });

  it('seuls les rôles internes accèdent au back-office', () => {
    expect(isStaff(['membre', 'entrepreneur', 'investisseur'])).toBe(false);
    expect(isStaff(['membre', 'editeur'])).toBe(true);
    expect(STAFF).toEqual(SENSITIVE);
  });

  it('aucun rôle externe ne détient de droit sur les objets internes', () => {
    const external: Role[] = ['membre', 'entrepreneur', 'talent', 'employeur', 'mentor', 'investisseur', 'souscripteur', 'partenaire'];
    const internal: Obj[] = ['journal_audit', 'membres', 'parametres', 'paiements', 'messages_contact', 'moderation', 'interrupteurs', 'decision_comite', 'controle_acces'];
    for (const r of external) for (const o of internal) for (const a of ACTIONS) {
      if (o === 'decision_comite' && r === 'entrepreneur' && a === 'L') continue; // décision sur son propre dossier (L*)
      expect(can([r], o, a), `${r} ${o} ${a}`).toBe(false);
    }
  });
});
