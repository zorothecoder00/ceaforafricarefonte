import { describe, it, expect, vi } from 'vitest';

// Réglage « localisation » simulé ; les valeurs par défaut viennent du code
let saved: unknown = null;
vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/settings', () => ({ getSetting: async () => saved }));
const { getLocalisation, timezoneOf, FIXED_RATES } = await import('../src/lib/localisation');

describe('pays, langues, devises', () => {
  it('reprend les valeurs du code tant que rien n’est réglé', async () => {
    saved = null;
    const l = await getLocalisation();
    expect(l.countries.find((c) => c.code === 'TG')).toMatchObject({ active: true, currency: 'XOF', tz: 'Africa/Lome', lang: 'fr' });
    expect(l.countries.find((c) => c.code === 'NG')).toMatchObject({ currency: 'NGN', lang: 'en' });
    expect(l.english).toBe(true);
  });
  it('applique les réglages de l’équipe sans toucher aux parités fixes du FCFA', async () => {
    saved = { countries: { CI: { active: false, currency: 'XOF', tz: 'Africa/Abidjan', lang: 'fr' } }, currencies: { NGN: { active: true, perEur: 1750 }, XOF: { active: true, perEur: 1 }, USD: { active: false, perEur: 1.1 } }, english: false, ratesDate: '2026-10-06', ratesSource: 'BCEAO' };
    const l = await getLocalisation();
    expect(l.countries.find((c) => c.code === 'CI')!.active).toBe(false);
    expect(l.currencies.find((c) => c.code === 'NGN')!.perEur).toBe(1750);
    expect(l.currencies.find((c) => c.code === 'XOF')!.perEur).toBe(FIXED_RATES.XOF);
    expect(l.currencies.find((c) => c.code === 'USD')!.active).toBe(false);
    expect(l).toMatchObject({ english: false, ratesDate: '2026-10-06', ratesSource: 'BCEAO' });
  });
  it('donne le fuseau d’un pays, Lomé à défaut', async () => {
    saved = { countries: { KE: { active: true, currency: 'KES', tz: 'Africa/Nairobi', lang: 'en' } }, currencies: {}, english: true, ratesDate: '', ratesSource: '' };
    expect(await timezoneOf('KE')).toBe('Africa/Nairobi');
    expect(await timezoneOf(null)).toBe('Africa/Lome');
  });
});
