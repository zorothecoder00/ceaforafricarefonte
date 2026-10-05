/* Base de connaissances de CEA Copilot (CDC §11) : la recherche renvoie des fiches pertinentes et sourcées. */
import { describe, it, expect } from 'vitest';
import { knowledgeBase, retrieve } from '../src/lib/kb';

describe('base de connaissances', () => {
  it('chaque fiche a un titre, un texte et un lien interne', () => {
    const kb = knowledgeBase();
    expect(kb.length).toBeGreaterThan(50);
    for (const d of kb) {
      expect(d.title).toBeTruthy();
      expect(d.text).toBeTruthy();
      expect(d.url.startsWith('/')).toBe(true);
    }
    expect(new Set(kb.map((d) => d.id)).size).toBe(kb.length);
  });

  it('trouve les bonnes fiches, même avec des fautes', () => {
    expect(retrieve('Comment activer la double authentification ?').map((d) => d.id)).toContain('aide:double-authentification');
    expect(retrieve('quand a lieu le forum panafricain').some((d) => d.id === 'evt:e1')).toBe(true);
    expect(retrieve('je veux pitcher devant des investiseurs').some((d) => d.id === 'cours:c3')).toBe(true);
    expect(retrieve("qu'est-ce que la BRVM").some((d) => d.kind === 'Glossaire')).toBe(true);
  });

  it('ne renvoie rien pour une question vide de sens', () => {
    expect(retrieve('et ?')).toEqual([]);
  });
});
