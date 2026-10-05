/* Programmes et cohortes (CDC §12) : grille pondérée, agrégation des jurys, formulaire de candidature, état d'un appel. */
import { describe, expect, it } from 'vitest';
import { Grid, DEFAULT_GRID, DEFAULT_FIELDS, weightedTotal, aggregate, checkAnswers, callState, rate } from '../src/lib/programmes';

const sub = (total: number | null, conflict = false) => ({ total, conflict, submittedAt: new Date() });

describe('grille d’évaluation', () => {
  it('la grille par défaut est valide (poids = 100)', () => expect(Grid.safeParse(DEFAULT_GRID).success).toBe(true));
  it('refuse une grille dont les poids ne font pas 100 ou avec des doublons', () => {
    expect(Grid.safeParse([{ key: 'a', label: 'Aaa', weight: 60, hint: '' }]).success).toBe(false);
    expect(Grid.safeParse([{ key: 'a', label: 'Aaa', weight: 50, hint: '' }, { key: 'a', label: 'Bbb', weight: 50, hint: '' }]).success).toBe(false);
  });
  it('total pondéré sur 100', () => {
    const all5 = Object.fromEntries(DEFAULT_GRID.map((c) => [c.key, 5]));
    const all0 = Object.fromEntries(DEFAULT_GRID.map((c) => [c.key, 0]));
    expect(weightedTotal(DEFAULT_GRID, all5)).toBe(100);
    expect(weightedTotal(DEFAULT_GRID, all0)).toBe(0);
    // équipe (25 %) à 5, le reste à 0 → 25
    expect(weightedTotal(DEFAULT_GRID, { ...all0, equipe: 5 })).toBe(25);
  });
  it('un critère non noté ou hors échelle donne null', () => {
    expect(weightedTotal(DEFAULT_GRID, { probleme: 3 })).toBeNull();
    expect(weightedTotal(DEFAULT_GRID, Object.fromEntries(DEFAULT_GRID.map((c) => [c.key, 6])))).toBeNull();
  });
});

describe('agrégation des jurys', () => {
  it('moyenne des évaluations soumises, hors conflits et brouillons', () => {
    const a = aggregate([sub(80), sub(60), sub(null, true), { total: 10, conflict: false, submittedAt: null }], 2);
    expect(a).toMatchObject({ n: 2, mean: 70, spread: 20, complete: true, divergent: false });
  });
  it('signale une forte divergence entre jurés', () => expect(aggregate([sub(85), sub(55)], 3)).toMatchObject({ divergent: true, complete: false }));
  it('aucune évaluation : pas de moyenne', () => expect(aggregate([], 2).mean).toBeNull());
});

describe('formulaire de candidature', () => {
  const ok = { entreprise: 'Manioc+', secteur: 'Agriculture et agro-industrie', probleme: 'Pertes après récolte', traction: '12 clients' };
  it('accepte des réponses complètes et ignore les champs inconnus', () => {
    const r = checkAnswers(DEFAULT_FIELDS, { ...ok, pirate: 'x' });
    expect(r.ok && Object.keys(r.data)).toEqual(['entreprise', 'secteur', 'probleme', 'traction']);
  });
  it('refuse un champ requis manquant ou un choix inexistant', () => {
    expect(checkAnswers(DEFAULT_FIELDS, { ...ok, probleme: '' }).ok).toBe(false);
    expect(checkAnswers(DEFAULT_FIELDS, { ...ok, secteur: 'Pétrole' }).ok).toBe(false);
  });
});

describe('état d’un appel et indicateurs', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  const d = (s: string) => new Date(s);
  it('suit les dates', () => {
    expect(callState({ status: 'ouvert', opensAt: d('2026-11-01'), closesAt: d('2026-12-01') }, now)).toBe('a_venir');
    expect(callState({ status: 'ouvert', opensAt: d('2026-09-01'), closesAt: d('2026-12-01') }, now)).toBe('ouvert');
    expect(callState({ status: 'ouvert', opensAt: null, closesAt: d('2026-10-01') }, now)).toBe('clos');
    expect(callState({ status: 'brouillon', opensAt: null, closesAt: null }, now)).toBe('brouillon');
  });
  it('taux arrondi, null sans dénominateur', () => {
    expect(rate(2, 3)).toBe(67);
    expect(rate(0, 0)).toBeNull();
  });
});
