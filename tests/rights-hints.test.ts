import { describe, it, expect } from 'vitest';
import { missingRights, lockedFor, PAGE_ACTIONS } from '../src/lib/rights-hints';
import { OBJS } from '../src/lib/rbac';

describe('explication des droits du back-office', () => {
  it("l'administrateur peut créer et supprimer des projets (écart assumé au CDC)", () => {
    expect(missingRights(['membre', 'admin'], 'fiche_projet')).toEqual([]);
  });

  it('le chargé de programme ne peut pas créer de projet et le sait', () => {
    const m = missingRights(['membre', 'charge_programme'], 'fiche_projet');
    expect(m.map((x) => x.action)).toEqual(['C']);
    expect(m[0].what).toContain('créer un projet');
  });

  it("l'administrateur ne décide pas des candidatures (CDC) : l'action est expliquée", () => {
    expect(missingRights(['admin'], 'candidature').map((x) => x.action)).toEqual(['V']);
  });

  it('un responsable pays ne gère les contenus que de son pays', () => {
    const m = missingRights(['responsable_pays'], 'contenus');
    expect(m.find((x) => x.action === 'C')?.own).toBe(true);
    expect(m.find((x) => x.action === 'V')?.own).toBe(false);
  });

  it('les cases verrouillées sont signalées', () => {
    expect(lockedFor(['admin'], 'pieces_kyc')).toMatch(/conformité/);
    expect(lockedFor(['admin'], 'fiche_projet')).toBeNull();
  });

  it('chaque objet expliqué existe dans la matrice', () => {
    for (const o of Object.keys(PAGE_ACTIONS)) expect(OBJS).toContain(o);
  });
});
