import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/notify', () => ({ notify: vi.fn() }));

const { closeOn, stocksAt, dayOf, lastTradingDay, priceMap } = await import('../src/lib/marche-simule');
const { portfolioValue, perfPct, monthKey, monthEnd, previousMonth, START_CASH } = await import('../src/lib/vp-contest');
const { OpportunityPage, readPage, emptyPage } = await import('../src/lib/opportunity-page');
const { STOCKS } = await import('../src/data/site');

const ANCHOR = dayOf(new Date('2026-10-01T12:00:00Z'));

describe('marché simulé', () => {
  it('le cours du jour d’ancrage est le cours de référence', () => {
    for (const s of STOCKS) expect(closeOn(s.n, s.p, ANCHOR)).toBe(s.p);
  });
  it('est déterministe et ne bouge pas le week-end', () => {
    const s = STOCKS[0];
    const fri = dayOf(new Date('2026-10-09T10:00:00Z')), sat = fri + 1, sun = fri + 2;
    expect(closeOn(s.n, s.p, fri)).toBe(closeOn(s.n, s.p, fri));
    expect(closeOn(s.n, s.p, sat)).toBe(closeOn(s.n, s.p, fri));
    expect(closeOn(s.n, s.p, sun)).toBe(closeOn(s.n, s.p, fri));
    expect(lastTradingDay(sun)).toBe(fri);
  });
  it('varie d’un jour de bourse à l’autre, dans des bornes raisonnables', () => {
    const s = STOCKS[1];
    const days = Array.from({ length: 20 }, (_, i) => ANCHOR + 1 + i).filter((d) => lastTradingDay(d) === d);
    const prices = days.map((d) => closeOn(s.n, s.p, d));
    expect(new Set(prices).size).toBeGreaterThan(5);
    for (let i = 1; i < prices.length; i++) expect(Math.abs(prices[i] / prices[i - 1] - 1)).toBeLessThan(0.08);
  });
  it('donne la variation par rapport à la séance précédente', () => {
    const at = new Date('2026-10-13T09:00:00Z');
    const s = stocksAt(at)[0];
    expect(s.ch).toBeCloseTo(Math.round((s.p / s.prev - 1) * 1000) / 10, 5);
    expect(priceMap(at)[s.n]).toBe(s.p);
  });
});

describe('concours de portefeuille virtuel', () => {
  it('valorise liquidités et titres', () => {
    expect(portfolioValue({ cash: 1000, positions: { A: 2, B: 1 } }, { A: 100, B: 50 })).toBe(1250);
    expect(perfPct(START_CASH)).toBe(0);
    expect(perfPct(START_CASH * 1.1234)).toBe(12.34);
  });
  it('calcule les mois en UTC', () => {
    expect(monthKey(new Date('2026-10-31T23:59:00Z'))).toBe('2026-10');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(monthEnd('2026-02').toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });
});

describe('page d’opportunité', () => {
  it('accepte une page complète et refuse une répartition des fonds différente de 100 %', () => {
    const page = { ...emptyPage(), tagline: 'Le lait frais livré au Sahel', funds: [{ label: 'Équipement', pct: 60 }, { label: 'Recrutement', pct: 40 }] };
    expect(OpportunityPage.safeParse(page).success).toBe(true);
    expect(OpportunityPage.safeParse({ ...page, funds: [{ label: 'Équipement', pct: 60 }] }).success).toBe(false);
  });
  it('refuse une vidéo hors https', () => {
    expect(OpportunityPage.safeParse({ ...emptyPage(), video: 'http://exemple.com/v.mp4' }).success).toBe(false);
    expect(OpportunityPage.safeParse({ ...emptyPage(), video: 'javascript:alert(1)' }).success).toBe(false);
  });
  it('considère une page vide ou invalide comme absente', () => {
    expect(readPage(null)).toBeNull();
    expect(readPage(emptyPage())).toBeNull();
    expect(readPage({ ...emptyPage(), highlights: ['Rentable depuis 2025'] })?.highlights).toEqual(['Rentable depuis 2025']);
  });
});
