/* Orientation en 5 questions (CDC §11) : les recommandations par règles (utilisées sans IA) sont pertinentes et valides. */
import { describe, it, expect } from 'vitest';
import { catalog, ruleRecs, validAnswers, QUESTIONS } from '../src/lib/orientation';

describe('orientation', () => {
  it('le catalogue a des identifiants uniques et des liens internes', () => {
    const c = catalog();
    expect(new Set(c.map((i) => i.id)).size).toBe(c.length);
    for (const i of c) expect(i.url.startsWith('/')).toBe(true);
  });

  it('refuse des réponses incomplètes ou inconnues', () => {
    expect(validAnswers({ stade: 'idee' })).toBeNull();
    expect(validAnswers({ stade: 'x', besoin: 'former', secteur: 'agri', fonds: 'aucun', cible: 'non' })).toBeNull();
    expect(validAnswers(Object.fromEntries(QUESTIONS.map((q) => [q.k, q.opts[0].v])))).not.toBeNull();
  });

  it('oriente un porteur d’idée vers la pré-incubation ou l’incubation et une formation', () => {
    const r = ruleRecs({ stade: 'idee', besoin: 'structurer', secteur: 'commerce', fonds: 'aucun', cible: 'non' });
    expect(['Pré-incubation', 'Incubation']).toContain(r.find((x) => x.kind === 'programme')?.title);
    expect(r.some((x) => x.kind === 'cours')).toBe(true);
    expect(r.some((x) => x.kind === 'financement')).toBe(false);
  });

  it('met le financement en premier pour une levée importante', () => {
    const r = ruleRecs({ stade: 'croissance', besoin: 'financer', secteur: 'numerique', fonds: 'grand', cible: 'non' });
    expect(r[0].kind).toBe('financement');
    expect(r.find((x) => x.kind === 'programme')?.title).toMatch(/Investor Ready|Accélérateur/);
    expect(r.every((x) => x.why.length > 0)).toBe(true);
  });

  it('propose le programme dédié quand il s’applique', () => {
    const r = ruleRecs({ stade: 'lance', besoin: 'clients', secteur: 'agri', fonds: 'petit', cible: 'sahel' });
    expect(r.some((x) => x.title === 'Agritech Sahel')).toBe(true);
  });
});
