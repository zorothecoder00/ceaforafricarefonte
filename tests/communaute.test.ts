import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/notify', () => ({ notify: vi.fn() }));

const { makePairs, mondayOf } = await import('../src/lib/coffee');
const { shortName, BAREME } = await import('../src/lib/points');
const { validCode } = await import('../src/lib/referrals');

describe('café virtuel', () => {
  it('forme des binômes et laisse le dernier en attente si le nombre est impair', () => {
    const r = makePairs(['a', 'b', 'c', 'd', 'e'], new Set());
    expect(r.pairs).toEqual([['a', 'b'], ['c', 'd']]);
    expect(r.waiting).toEqual(['e']);
  });
  it('ne reforme pas une paire récente', () => {
    const r = makePairs(['a', 'b', 'c', 'd'], new Set(['a|b', 'c|d']));
    expect(r.pairs).toEqual([['a', 'c'], ['b', 'd']]);
  });
  it('laisse en attente quelqu’un qui a déjà rencontré tout le monde', () => {
    const r = makePairs(['a', 'b', 'c'], new Set(['a|b', 'a|c']));
    expect(r.pairs).toEqual([['b', 'c']]);
    expect(r.waiting).toEqual(['a']);
  });
  it('calcule le lundi de la semaine (UTC)', () => {
    expect(mondayOf(new Date('2026-10-08T12:00:00Z'))).toBe('2026-10-05');
    expect(mondayOf(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
    expect(mondayOf(new Date('2026-10-11T23:59:00Z'))).toBe('2026-10-05');
  });
});

describe('points et parrainage', () => {
  it('abrège les noms dans les classements', () => {
    expect(shortName('Aïcha Agbodjan')).toBe('Aïcha A.');
    expect(shortName('Jean-Marc Ekotto')).toBe('Jean-Marc E.');
    expect(shortName('Fatou')).toBe('Fatou');
  });
  it('récompense davantage le parrain que le filleul', () => {
    expect(BAREME.parrainage.pts).toBeGreaterThan(BAREME.filleul.pts);
  });
  it('n’accepte que des codes de parrainage bien formés', () => {
    expect(validCode('AB3K9Z')).toBe(true);
    expect(validCode('ab3k9z')).toBe(false);
    expect(validCode('AB3K9')).toBe(false);
    expect(validCode('<script>')).toBe(false);
  });
});
