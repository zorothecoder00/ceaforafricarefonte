import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/notify', () => ({ notify: vi.fn() }));
vi.mock('../src/lib/catalog', () => ({ allEvents: vi.fn(async () => []) }));

const { forecast, DEFAULT_SHOW_RATE } = await import('../src/lib/event-forecast');
const { ticketCode } = await import('../src/lib/event-leads');

const now = new Date('2026-10-08T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const sales = (n: number, within = 10) => Array.from({ length: n }, (_, i) => daysAgo(i % within));

describe('prévision de fréquentation', () => {
  it('projette les inscriptions au rythme des 14 derniers jours et applique le taux de présence', () => {
    const f = forecast({ date: '2026-10-28', capacity: 500, sales: sales(140), waitlist: 0, showRate: null, now });
    expect(f.daysLeft).toBe(20);
    expect(f.perDay).toBe(10);
    expect(f.projected).toBe(340);
    expect(f.expected).toBe(Math.round(340 * DEFAULT_SHOW_RATE));
    expect(f.showRateSource).toBe('defaut');
    expect(f.level).toBe('ok');
  });
  it('annonce la date du complet quand la jauge sera atteinte avant l’événement', () => {
    const f = forecast({ date: '2026-10-28', capacity: 320, sales: sales(140), waitlist: 0, showRate: 0.75, now });
    expect(f.projected).toBe(320);
    expect(f.fullOn).toBe('2026-10-26');
    expect(f.level).toBe('complet_prevu');
  });
  it('signale la surréservation quand la demande dépasse la jauge de plus de 10 %', () => {
    const f = forecast({ date: '2026-10-28', capacity: 100, sales: sales(100), waitlist: 30, showRate: 0.75, now });
    expect(f.level).toBe('surreservation');
    expect(f.extraSeats).toBe(33);
  });
  it('reconnaît un événement complet sans demande excédentaire', () => {
    const old = Array.from({ length: 100 }, () => daysAgo(40));
    const f = forecast({ date: '2026-10-28', capacity: 100, sales: old, waitlist: 5, showRate: null, now });
    expect(f.level).toBe('complet');
    expect(f.extraSeats).toBe(0);
  });
  it('ne lève pas d’alerte sans jauge', () => {
    expect(forecast({ date: '2026-10-28', capacity: null, sales: sales(500), waitlist: 0, showRate: null, now }).level).toBe('ok');
  });
});

describe('lecture des badges', () => {
  it('accepte le code seul ou l’adresse de vérification du QR code', () => {
    expect(ticketCode('tkt-e1-ab12cd')).toBe('TKT-E1-AB12CD');
    expect(ticketCode('https://cea4africa.com/verifier/billet/TKT-E1-AB12CD')).toBe('TKT-E1-AB12CD');
  });
});
