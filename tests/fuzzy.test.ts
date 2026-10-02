/* Recherche tolérante aux fautes (CDC §10). */
import { describe, it, expect } from 'vitest';
import { distance, score, search } from '../src/lib/fuzzy';

describe('distance', () => {
  it('compte substitutions, insertions, suppressions et inversions', () => {
    expect(distance('marketing', 'marketing')).toBe(0);
    expect(distance('marketting', 'marketing')).toBe(1);
    expect(distance('finnace', 'finance')).toBe(1); // inversion
    expect(distance('bourse', 'course')).toBe(1);
    expect(distance('abc', 'xyzabc', 2)).toBe(3); // arrêt anticipé
  });
});

describe('score et search', () => {
  const items = [
    { t: 'Marketing digital à petit budget', d: 'Cours CEA Academy' },
    { t: 'Comprendre la bourse BRVM', d: 'Cours de finance' },
    { t: 'Forum panafricain CEA 2026', d: 'Lomé, novembre' },
    { t: 'Pitcher devant des investisseurs', d: 'Levée de fonds' },
  ];
  const run = (q: string) => search(items, q, (x) => [x.t, x.d]).map((x) => x.t);

  it('ignore accents et casse', () => {
    expect(run('LOME')).toEqual(['Forum panafricain CEA 2026']);
  });
  it('tolère les fautes de frappe', () => {
    expect(run('marketting')[0]).toBe('Marketing digital à petit budget');
    expect(run('investiseurs')[0]).toBe('Pitcher devant des investisseurs');
    expect(run('panafrician')[0]).toBe('Forum panafricain CEA 2026');
  });
  it('trouve les débuts de mots', () => {
    expect(run('pana')).toEqual(['Forum panafricain CEA 2026']);
  });
  it('exige tous les mots', () => {
    expect(run('forum bourse')).toEqual([]);
  });
  it('classe le titre avant la description', () => {
    expect(score('finance', 'Finance verte', '')).toBeGreaterThan(score('finance', 'Comprendre la bourse', 'Cours de finance'));
  });
  it('ne tolère pas de faute sur les mots très courts', () => {
    expect(run('cex')).toEqual([]);
  });
});
