import { describe, it, expect } from 'vitest';
import { computeTable, runScenario, waterfall, vested, Model, type Model as M } from '../src/lib/captable';

const model: M = {
  classes: [{ id: 'ord', name: 'Actions ordinaires', kind: 'ordinaire', multiple: 0 }, { id: 'pref', name: 'Actions de préférence A', kind: 'preference', multiple: 1 }],
  holders: [
    { id: 'a', name: 'Aïcha', kind: 'fondateur' }, { id: 'k', name: 'Kofi', kind: 'fondateur' },
    { id: 'f', name: 'Fonds Sahel', kind: 'investisseur' }, { id: 's', name: 'Salariée', kind: 'salarie' },
  ],
  ops: [
    { t: 'emission', date: '2024-01-10', holder: 'a', cls: 'ord', shares: 600_000, price: 10 },
    { t: 'emission', date: '2024-01-10', holder: 'k', cls: 'ord', shares: 400_000, price: 10 },
    { t: 'reserve', date: '2024-06-01', options: 100_000 },
    { t: 'bspce', date: '2024-06-01', holder: 's', options: 48_000, strike: 50, vesting: 48, cliff: 12 },
    { t: 'emission', date: '2025-03-01', holder: 'f', cls: 'pref', shares: 250_000, price: 400 },
    { t: 'cession', date: '2025-06-01', from: 'k', to: 'a', cls: 'ord', shares: 50_000, price: 300 },
  ],
  scenarios: [{ id: 's1', name: 'Série A', preMoney: 1_000_000_000, raise: 250_000_000, poolPct: 10, multiple: 1, exit: 3_000_000_000 }],
};

describe('table de capitalisation', () => {
  it('valide le modèle', () => {
    expect(Model.safeParse(model).success).toBe(true);
  });
  it('calcule le capital émis et totalement dilué', () => {
    const t = computeTable(model, '2026-10-08');
    expect(t.issued).toBe(1_250_000);
    expect(t.unallocated).toBe(52_000);
    expect(t.outstanding).toBe(48_000);
    expect(t.fd).toBe(1_350_000);
    expect(t.rows.find((r) => r.holder.id === 'a')!.shares).toBe(650_000);
    expect(t.rows.find((r) => r.holder.id === 'k')!.shares).toBe(350_000);
    expect(t.investedByClass.pref).toBe(100_000_000);
    expect(t.errors).toEqual([]);
  });
  it('ignore les opérations postérieures à la date demandée', () => {
    expect(computeTable(model, '2024-12-31').issued).toBe(1_000_000);
  });
  it('signale une cession supérieure aux actions détenues et un exercice non acquis', () => {
    const bad: M = { ...model, ops: [...model.ops, { t: 'cession', date: '2025-07-01', from: 's', to: 'a', cls: 'ord', shares: 10, price: 1 }, { t: 'exercice', date: '2024-08-01', holder: 's', options: 1000 }] };
    expect(computeTable(bad, '2026-10-08').errors.length).toBe(2);
  });
});

describe('BSPCE', () => {
  it('rien avant la falaise, puis linéaire', () => {
    const g = { date: '2024-06-01', options: 48_000, vesting: 48, cliff: 12 };
    expect(vested(g, '2025-05-31')).toBe(0);
    expect(vested(g, '2025-06-01')).toBe(12_000);
    expect(vested(g, '2026-06-01')).toBe(24_000);
    expect(vested(g, '2030-01-01')).toBe(48_000);
  });
});

describe('scénarios de levée', () => {
  it('complète la réserve et dilue', () => {
    const t = computeTable(model, '2026-10-08');
    const r = runScenario(model, t, model.scenarios[0]);
    expect(r.error).toBeUndefined();
    const pool = r.lines.find((l) => l.name.startsWith('Réserve'))!;
    expect(pool.after).toBeCloseTo(0.1, 2);
    const inv = r.lines.find((l) => l.name.startsWith('Investisseur'))!;
    expect(inv.after).toBeCloseTo(0.2, 2); // 250 M sur 1 250 M post-money
    expect(r.lines.reduce((a, l) => a + l.after, 0)).toBeCloseTo(1, 5);
  });
  it('répartit toute la sortie', () => {
    const t = computeTable(model, '2026-10-08');
    const r = runScenario(model, t, model.scenarios[0]);
    const pool = r.lines.find((l) => l.name.startsWith('Réserve'))!;
    expect(pool.exit).toBe(0);
    expect(r.lines.reduce((a, l) => a + l.exit, 0)).toBeCloseTo(3_000_000_000, -2);
  });
});

describe('préférences de liquidation', () => {
  it('petite sortie : le privilégié récupère sa mise', () => {
    const v = waterfall([{ shares: 800, pref: 0 }, { shares: 200, pref: 500 }], 600);
    expect(v[1]).toBe(500);
    expect(v[0]).toBe(100);
  });
  it('grande sortie : le privilégié convertit', () => {
    const v = waterfall([{ shares: 800, pref: 0 }, { shares: 200, pref: 500 }], 10_000);
    expect(v[1]).toBe(2_000);
    expect(v[0]).toBe(8_000);
  });
  it('sortie inférieure aux préférences : partage au prorata des préférences', () => {
    const v = waterfall([{ shares: 500, pref: 300 }, { shares: 500, pref: 100 }, { shares: 1000, pref: 0 }], 200);
    expect(v[0]).toBe(150);
    expect(v[1]).toBe(50);
    expect(v[2]).toBe(0);
  });
});
