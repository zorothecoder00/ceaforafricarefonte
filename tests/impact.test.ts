import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { publishable, readFilters, MIN_CELL } = await import('../src/lib/impact');

describe('observatoire d’impact', () => {
  it('ne publie aucune cellule de moins de 10 personnes', () => {
    expect(MIN_CELL).toBe(10);
    expect(publishable(9)).toBeNull();
    expect(publishable(10)).toBe(10);
    // Un montant n'est publié que s'il agrège au moins 10 contributeurs
    expect(publishable(50_000_000, 3)).toBeNull();
    expect(publishable(50_000_000, 12)).toBe(50_000_000);
  });
  it('lit et valide les filtres de l’adresse', () => {
    expect(readFilters(new URLSearchParams('annee=2026&pays=tg&secteur=Agriculture&genre=Femme'))).toEqual({ year: 2026, country: 'TG', sector: 'Agriculture', gender: 'Femme' });
    expect(readFilters(new URLSearchParams('annee=abc&pays=TOGO&genre=Autre'))).toEqual({});
  });
});
