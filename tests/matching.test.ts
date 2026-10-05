/* Mise en relation avec score expliqué (CDC §11) : cohérence des scores et tests de biais (genre, pays, langue). */
import { describe, it, expect } from 'vitest';
import { mentorMatch, jobMatch } from '../src/lib/matching';

const mentor = { expertise: 'Levée de fonds, modèle financier', sectors: ['Fintech', 'Agro-industrie'], languages: ['Français', 'Anglais'], rating: 45 };

describe('mise en relation', () => {
  it('chaque score est la somme de ses facteurs, entre 0 et 100', () => {
    const m = mentorMatch({ sector: 'Fintech', needs: 'préparer une levée de fonds', lang: 'fr' }, mentor);
    expect(m.score).toBe(Math.round(m.factors.reduce((n, f) => n + f.points, 0)));
    expect(m.score).toBeGreaterThan(60);
    expect(m.score).toBeLessThanOrEqual(100);
    for (const f of m.factors) expect(f.points).toBeLessThanOrEqual(f.max);
  });

  it('un mentor pertinent passe devant un mentor sans rapport', () => {
    const me = { sector: 'Fintech', needs: 'levée de fonds et modèle financier', lang: 'fr' };
    const other = { expertise: 'Recrutement, ressources humaines', sectors: ['BTP'], languages: ['Anglais'], rating: 45 };
    expect(mentorMatch(me, mentor).score).toBeGreaterThan(mentorMatch(me, other).score);
  });

  it('biais : le pays et le genre ne changent pas le score (ils ne sont pas des entrées)', () => {
    const base = { sector: 'Fintech', needs: 'levée de fonds', lang: 'fr' };
    // Les champs non prévus sont ignorés : mêmes besoins, autre pays ou genre → même score
    const a = mentorMatch({ ...base, country: 'TG', gender: 'Femme' } as typeof base, mentor);
    const b = mentorMatch({ ...base, country: 'NG', gender: 'Homme' } as typeof base, mentor);
    expect(a).toEqual(b);
    expect(mentorMatch(base, { ...mentor, country: 'KE' } as typeof mentor)).toEqual(mentorMatch(base, mentor));
  });

  it('biais : francophones et anglophones obtiennent le même score face à un mentor bilingue', () => {
    const fr = mentorMatch({ sector: 'Fintech', needs: 'levée de fonds', lang: 'fr' }, mentor);
    const en = mentorMatch({ sector: 'Fintech', needs: 'levée de fonds', lang: 'en' }, mentor);
    expect(fr.score).toBe(en.score);
  });

  it('offres : compétences et lieu de travail', () => {
    const job = { skills: ['Excel', 'Modélisation', 'Rédaction'], c: 'TG', remote: false };
    expect(jobMatch({ skills: ['excel', 'modelisation', 'rédaction'], country: 'TG' }, job).score).toBe(100);
    expect(jobMatch({ skills: ['Excel'], country: 'CI' }, job).score).toBe(27);
    expect(jobMatch({ skills: ['Excel'], country: 'CI' }, { ...job, remote: true }).score).toBe(47);
  });
});
