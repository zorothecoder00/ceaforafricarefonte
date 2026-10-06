import { describe, it, expect, vi } from 'vitest';

// Règles de fraude : filtres de modération simulés, aucune base
vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/settings', () => ({ getSetting: async () => ({ words: ['western union'], whatsapp: true, reviewLinks: true }) }));
const { jobReasons, isDisposable } = await import('../src/lib/fraud');

const job = (o: Partial<{ title: string; company: string; description: string; salary: string }>) => ({ title: 'Comptable', company: 'PayLink', description: 'Tenue de la comptabilité.', salary: '450 000 FCFA', ...o });

describe('détection de fraude', () => {
  it('laisse passer une annonce ordinaire', async () => {
    expect(await jobReasons(job({}), { email: 'rh@paylink.africa', createdAt: new Date(Date.now() - 30 * 86_400_000) })).toEqual([]);
  });
  it('signale une demande de paiement, un contact direct et un salaire irréaliste', async () => {
    const r = await jobReasons(job({ description: 'Frais de formation de 25 000 F à payer avant. Contact WhatsApp +228 90 00 00 00', salary: '25 000 000 FCFA / mois' }));
    expect(r.some((x) => x.includes('paiement'))).toBe(true);
    expect(r.some((x) => x.includes('hors de la plateforme'))).toBe(true);
    expect(r.some((x) => x.includes('anormalement élevée'))).toBe(true);
  });
  it('signale les expressions des filtres de modération et un recruteur tout neuf à messagerie jetable', async () => {
    const r = await jobReasons(job({ description: 'Paiement par Western Union' }), { email: 'x@yopmail.com', createdAt: new Date() });
    expect(r).toEqual(expect.arrayContaining([expect.stringContaining('western union'), expect.stringContaining('jetable'), expect.stringContaining('24 heures')]));
  });
  it('reconnaît les messageries jetables', () => {
    expect(isDisposable('a@mailinator.com')).toBe(true);
    expect(isDisposable('a@gmail.com')).toBe(false);
  });
});
