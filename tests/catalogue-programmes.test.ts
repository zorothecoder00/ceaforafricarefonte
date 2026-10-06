import { describe, it, expect } from 'vitest';
import { staticProgrammes, applyPath } from '../src/lib/catalogue';

describe('catalogue des programmes du code', () => {
  it("l'Accélérateur est ouvert jusqu'au 15 novembre 2026 à minuit, puis clos", () => {
    const before = staticProgrammes(new Date('2026-11-15T20:00:00Z')).find((p) => p.slug === 'accelerateur-c4')!;
    const after = staticProgrammes(new Date('2026-11-16T00:00:01Z')).find((p) => p.slug === 'accelerateur-c4')!;
    expect(before.state).toBe('ouvert');
    expect(before.canApply).toBe(true);
    expect(before.href).toBe('/programmes/candidature');
    expect(after.state).toBe('clos');
    expect(after.canApply).toBe(false);
  });

  it('un programme annoncé est « à venir » avec sa date d’ouverture, sans formulaire', () => {
    const p = staticProgrammes(new Date('2026-10-06T00:00:00Z')).find((x) => x.slug === 'pre-incubation')!;
    expect(p.state).toBe('a_venir');
    expect(p.opensAt?.toISOString().slice(0, 10)).toBe('2027-02-01');
    expect(p.canApply).toBe(false);
  });

  it('chaque programme a un identifiant unique et Investor Ready garde sa page', () => {
    const list = staticProgrammes();
    expect(new Set(list.map((p) => p.slug)).size).toBe(list.length);
    expect(applyPath('investor-ready')).toBe('/kapital/investor-ready');
    expect(applyPath('incubation-2027')).toBe('/programmes/appel/incubation-2027');
  });
});
