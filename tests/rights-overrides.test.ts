import { describe, it, expect, afterEach } from 'vitest';
import { can, scope, rightsOf, lockReason, normRights, setRightsOverrides, OBJS, OBJ_LABEL } from '../src/lib/rbac';

afterEach(() => setRightsOverrides({}));

describe('matrice des droits modifiable', () => {
  it('sans écart, applique la matrice du cahier des charges', () => {
    expect(rightsOf('admin', 'candidature')).toBe('L');
    expect(can(['admin'], 'candidature', 'V')).toBe(false);
  });

  it('un écart enregistré étend ou retire des droits', () => {
    setRightsOverrides({ admin: { fiche_projet: 'LCMV' }, charge_programme: { fiche_projet: '' } });
    expect(scope(['admin'], 'fiche_projet', 'C')).toBe('all');
    expect(can(['charge_programme'], 'fiche_projet', 'L')).toBe(false);
  });

  it('les cases verrouillées ignorent les écarts', () => {
    setRightsOverrides({ admin: { membres: '', parametres: 'L', pieces_kyc: 'L', journal_audit: 'LCMV' } });
    expect(rightsOf('admin', 'membres')).toBe('LCMV');
    expect(rightsOf('admin', 'parametres')).toBe('LCMV');
    expect(can(['admin'], 'pieces_kyc', 'L')).toBe(false);
    expect(rightsOf('admin', 'journal_audit')).toBe('L');
    expect(lockReason('editeur', 'contenus')).toBeNull();
  });

  it('normalise les valeurs saisies', () => {
    expect(normRights('vml')).toBe('LMV');
    expect(normRights('L*')).toBe('L*');
    expect(normRights('*')).toBe('');
    expect(normRights('LX')).toBeNull();
  });

  it('chaque objet a un libellé', () => {
    for (const o of OBJS) expect(OBJ_LABEL[o]).toBeTruthy();
  });
});
