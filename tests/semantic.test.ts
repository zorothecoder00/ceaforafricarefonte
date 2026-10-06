import { describe, it, expect, vi, beforeEach } from 'vitest';

// Recherche par le sens : réponse du modèle simulée (sorties structurées), base de connaissances réelle
let reply: string | null = null;
let lastSystem = '';
vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/cms', () => ({ publicArticles: async () => [] }));
vi.mock('../src/lib/ai', () => ({
  askModel: async (a: { system: string }) => { lastSystem = a.system; return reply === null ? null : { content: [{ type: 'text', text: reply }] }; },
}));
const { semanticSearch } = await import('../src/lib/semantic');
const { knowledgeBase } = await import('../src/lib/kb');

describe('recherche par le sens', () => {
  beforeEach(() => { reply = null; });

  it('renvoie les fiches choisies par le modèle, dans son ordre, et ignore les identifiants inventés', async () => {
    const [a, b] = knowledgeBase().filter((d) => d.id.startsWith('aide:'));
    reply = JSON.stringify({ reformulation: 'Payer avec Mobile Money', ids: [b.id, 'inexistant:42', a.id, b.id] });
    const r = await semanticSearch('je veux payer avec mon téléphone', 'fr');
    expect(r.mode).toBe('ia');
    expect(r.reformulation).toBe('Payer avec Mobile Money');
    expect(r.results.map((x) => x.h)).toEqual([b.url, a.url]);
  });

  it('donne au modèle tout le catalogue dans le prompt système', async () => {
    reply = JSON.stringify({ reformulation: 'x', ids: [] });
    await semanticSearch('question pour vérifier le catalogue', 'fr');
    const all = lastSystem.split('\n');
    expect(all.slice(all.indexOf('CATALOGUE') + 1).length).toBe(knowledgeBase().length);
  });

  it('préfixe les liens en anglais', async () => {
    const d = knowledgeBase().find((x) => x.id.startsWith('aide:'))!;
    reply = JSON.stringify({ reformulation: 'x', ids: [d.id] });
    const r = await semanticSearch('how do I pay with my phone', 'en');
    expect(r.results[0].h.startsWith('/en/')).toBe(true);
  });

  it('se replie sur la recherche par mots quand l’IA ne répond pas', async () => {
    reply = null;
    const r = await semanticSearch('mot de passe oublié compte', 'fr');
    expect(r.mode).toBe('mots');
    expect(r.results.length).toBeGreaterThan(0);
  });
});
