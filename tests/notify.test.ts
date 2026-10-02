/* Préférences de notification (CDC §10) : catégorie déduite du lien, heures de silence (y compris à cheval sur minuit). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { categoryOf, inQuietHours } = await import('../src/lib/notify');

describe('categoryOf', () => {
  it('classe les liens par catégorie', () => {
    expect(categoryOf('/espace/billets')).toBe('evenements');
    expect(categoryOf('/evenements/e1')).toBe('evenements');
    expect(categoryOf('/espace/candidatures')).toBe('candidatures');
    expect(categoryOf('/espace/projets/abc')).toBe('candidatures');
    expect(categoryOf('/verifier/certificat/CERT-1')).toBe('apprentissage');
    expect(categoryOf('/kapital/entreprise')).toBe('kapital');
    expect(categoryOf('/actionnariat/club')).toBe('communaute');
    expect(categoryOf('/espace/carte')).toBe('compte');
    expect(categoryOf(undefined)).toBe('compte');
  });
});

describe('inQuietHours', () => {
  const at = (hm: string) => new Date(`2026-10-02T${hm}:00Z`);
  const night = { from: '21:00', to: '07:00', tz: 'UTC' };
  it('créneau qui passe minuit', () => {
    expect(inQuietHours(night, at('22:30'))).toBe(true);
    expect(inQuietHours(night, at('03:00'))).toBe(true);
    expect(inQuietHours(night, at('07:00'))).toBe(false);
    expect(inQuietHours(night, at('12:00'))).toBe(false);
  });
  it('créneau dans la journée', () => {
    const lunch = { from: '12:00', to: '14:00', tz: 'UTC' };
    expect(inQuietHours(lunch, at('13:00'))).toBe(true);
    expect(inQuietHours(lunch, at('14:30'))).toBe(false);
  });
  it('tient compte du fuseau', () => {
    // 20:30 UTC = 21:30 à Lagos (UTC+1) → silence ; à Lomé (UTC+0) → non
    expect(inQuietHours({ ...night, tz: 'Africa/Lagos' }, at('20:30'))).toBe(true);
    expect(inQuietHours({ ...night, tz: 'Africa/Lome' }, at('20:30'))).toBe(false);
  });
  it('sans créneau', () => {
    expect(inQuietHours(null)).toBe(false);
    expect(inQuietHours({ from: '08:00', to: '08:00', tz: 'UTC' })).toBe(false);
  });
});
