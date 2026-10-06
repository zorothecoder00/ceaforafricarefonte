import { describe, it, expect, vi, beforeEach } from 'vitest';

// Domaines : lignes de la table simulées, domaines du code réels
let rows: Record<string, unknown>[] = [];
vi.mock('../src/lib/db', () => ({ db: { select: () => ({ from: () => ({ orderBy: async () => rows }) }) } }));
const { allDomains, clearDomainCache } = await import('../src/lib/domains');
const { DOMAINS } = await import('../src/data/site');
const row = (o: Record<string, unknown>) => ({ icon: 'info', name: 'CEA Test', dom: 'Test', summary: 'Un domaine de test pour vérifier.', highlight: '', link: null, audience: '', method: [], deliverables: [], position: 100, active: true, ...o });

describe('domaines d’intervention', () => {
  beforeEach(() => { rows = []; clearDomainCache(); });
  it('reprend les domaines du code tant que rien n’est enregistré', async () => {
    const d = await allDomains();
    expect(d.map((x) => x.id)).toEqual(DOMAINS.map((x) => x.id));
    expect(d.every((x) => x.source === 'code')).toBe(true);
  });
  it('ajoute un domaine créé, à sa place, avec sa page par défaut', async () => {
    rows = [row({ id: 'numerique', dom: 'Économie numérique', position: 15 })];
    const d = await allDomains();
    expect(d[1]).toMatchObject({ id: 'numerique', dom: 'Économie numérique', source: 'cree', to: '/domaines/numerique' });
  });
  it('remplace un domaine du code modifié et masque un domaine désactivé', async () => {
    const first = DOMAINS[0].id;
    rows = [row({ id: first, dom: 'Actionnariat (nouveau)', position: 10 }), row({ id: 'cache', active: false })];
    const d = await allDomains();
    expect(d.find((x) => x.id === first)).toMatchObject({ dom: 'Actionnariat (nouveau)', source: 'modifie' });
    expect(d.some((x) => x.id === 'cache')).toBe(false);
    clearDomainCache();
    expect((await allDomains({ all: true })).some((x) => x.id === 'cache')).toBe(true);
  });
});
