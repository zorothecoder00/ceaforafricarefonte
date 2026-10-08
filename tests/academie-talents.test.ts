import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/notify', () => ({ notify: vi.fn() }));
vi.mock('../src/lib/session', () => ({ reference: () => 'BADGE-TEST', audit: vi.fn() }));

const { streakOf } = await import('../src/lib/streaks');
const { optionOrder, grade, draw } = await import('../src/lib/skill-tests');
const { SKILL_TESTS, DRAW } = await import('../src/data/skill-tests');
const { gmt } = await import('../src/lib/cohorts');

describe('séries de jours d’apprentissage', () => {
  it('compte les jours consécutifs jusqu’à aujourd’hui', () => {
    expect(streakOf(['2026-10-06', '2026-10-07', '2026-10-08'], '2026-10-08')).toMatchObject({ current: 3, best: 3, today: true });
  });
  it('garde la série tant que la journée n’est pas finie', () => {
    expect(streakOf(['2026-10-06', '2026-10-07'], '2026-10-08')).toMatchObject({ current: 2, today: false });
  });
  it('perd la série après un jour sans activité, mais garde le record', () => {
    expect(streakOf(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-06'], '2026-10-08')).toMatchObject({ current: 0, best: 4, total: 5 });
  });
  it('franchit les changements de mois', () => {
    expect(streakOf(['2026-09-30', '2026-10-01'], '2026-10-01').current).toBe(2);
  });
});

describe('tests de compétences', () => {
  const test = SKILL_TESTS[0];
  it('mélange les réponses de façon stable pour un passage, et différemment d’un passage à l’autre', () => {
    const a = optionOrder('passage-a', 0, 4), b = optionOrder('passage-a', 0, 4);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([0, 1, 2, 3]);
    const orders = new Set(Array.from({ length: 20 }, (_, i) => optionOrder(`passage-${i}`, 0, 4).join('')));
    expect(orders.size).toBeGreaterThan(3);
  });
  it('corrige à partir de l’ordre affiché', () => {
    const id = 'passage-x', qs = [0, 1, 2, 3, 4, 5, 6, 7];
    const right = qs.map((qi) => optionOrder(id, qi, test.questions[qi].o.length).indexOf(test.questions[qi].a));
    expect(grade(test, id, qs, right)).toEqual({ score: 8, total: 8, passed: true });
    const wrong = right.map((x, i) => (i < 3 ? (x + 1) % 4 : x));
    expect(grade(test, id, qs, wrong)).toMatchObject({ score: 5, passed: false });
    expect(grade(test, id, qs, qs.map(() => -1)).score).toBe(0);
  });
  it('tire des questions distinctes', () => {
    const d = draw(10, DRAW);
    expect(d).toHaveLength(DRAW);
    expect(new Set(d).size).toBe(DRAW);
    expect(d.every((x) => x >= 0 && x < 10)).toBe(true);
  });
  it('chaque test a assez de questions et des réponses valides', () => {
    for (const t of SKILL_TESTS) {
      expect(t.questions.length).toBeGreaterThanOrEqual(DRAW);
      for (const q of t.questions) expect(q.a).toBeLessThan(q.o.length);
    }
  });
});

describe('cohortes', () => {
  it('lit les dates saisies en heure GMT', () => {
    expect(gmt('2026-11-03T18:30').toISOString()).toBe('2026-11-03T18:30:00.000Z');
  });
});
