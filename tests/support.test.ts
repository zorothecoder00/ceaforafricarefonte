/* Centre d'aide (CDC §10, §12) : échéance de réponse en jours ouvrés, liens de suivi signés, base de connaissances. */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { addBusinessDays, dueFrom, trackPath, signRef } = await import('../src/lib/support');
const { HELP, HELP_CATS } = await import('../src/data/aide');

beforeAll(() => { process.env.BETTER_AUTH_SECRET ??= 'secret-de-test'; });

describe('échéance (SLA)', () => {
  const vendredi = new Date('2026-10-02T10:00:00Z');
  it('saute le week-end', () => {
    expect(addBusinessDays(vendredi, 1).toISOString().slice(0, 10)).toBe('2026-10-05'); // lundi
    expect(addBusinessDays(vendredi, 2).toISOString().slice(0, 10)).toBe('2026-10-06');
  });
  it('lit le délai annoncé', () => {
    expect(dueFrom('1 jour ouvré', vendredi).toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(dueFrom('48 heures', vendredi).toISOString()).toBe('2026-10-04T10:00:00.000Z');
    // « 10 jours ouvrés (accusé de réception sous 48 heures) » : c'est le délai de réponse qui compte
    expect(dueFrom('10 jours ouvrés (accusé de réception sous 48 heures)', vendredi).toISOString().slice(0, 10)).toBe('2026-10-16');
    expect(dueFrom('rapidement', vendredi).toISOString().slice(0, 10)).toBe('2026-10-06'); // 2 jours ouvrés par défaut
  });
});

describe('lien de suivi', () => {
  it('contient une clé propre au ticket, distincte de celle de l’agenda', () => {
    expect(trackPath('DEM-2026-ABC')).toContain(`k=${signRef('ticket', 'DEM-2026-ABC')}`);
    expect(signRef('ticket', 'X')).not.toBe(signRef('agenda', 'X'));
  });
});

describe('base de connaissances', () => {
  it('slugs uniques, catégories connues, aucun slug réservé', () => {
    const slugs = HELP.map((h) => h.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(HELP.every((h) => h.cat in HELP_CATS && h.a.length > 0)).toBe(true);
    expect(slugs).not.toContain('suivi');
  });
  it('chaque thème a au moins un article', () => {
    expect(Object.keys(HELP_CATS).every((c) => HELP.some((h) => h.cat === c))).toBe(true);
  });
});
