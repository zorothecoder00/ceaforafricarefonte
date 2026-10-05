/* Finance (CDC §12) : montants des factures, numérotation, rapprochement avec le relevé de l'agrégateur, export XLSX. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { totals, formatNumber } = await import('../src/lib/invoices');
const { parseCsv, readStatement, reconcile } = await import('../src/lib/reconcile');
const { xlsx } = await import('../src/lib/xlsx');

describe('factures', () => {
  it('HT, taxe en pour mille arrondie au FCFA, TTC', () => {
    expect(totals([{ label: 'Pack Or', qty: 1, unitXof: 1_000_000 }], 180)).toEqual({ ht: 1_000_000, tax: 180_000, ttc: 1_180_000 });
    expect(totals([{ label: 'A', qty: 3, unitXof: 333 }], 0)).toEqual({ ht: 999, tax: 0, ttc: 999 });
  });
  it('numéro continu sur 6 chiffres, préfixe par type', () => {
    expect(formatNumber('facture', 2026, 42)).toBe('FAC-2026-000042');
    expect(formatNumber('avoir', 2026, 1)).toBe('AV-2026-000001');
  });
});

describe('rapprochement', () => {
  it('lit un CSV au séparateur « ; » avec guillemets et montants à espaces', () => {
    expect(parseCsv('a;b\n"x;y";"2 500"\n')).toEqual([['a', 'b'], ['x;y', '2 500']]);
    const r = readStatement('Transaction ID;Montant;Statut;Date\nPAY-1;25 000;ACCEPTED;2026-10-01\nPAY-2;10000;REFUSED;2026-10-02\n');
    expect('rows' in r && r.rows.map((x) => [x.ref, x.amount, x.ok])).toEqual([['PAY-1', 25000, true], ['PAY-2', 10000, false]]);
  });
  it('refuse un relevé sans colonne de référence', () => expect('error' in readStatement('foo,bar\n1,2')).toBe(true));
  it('classe les écarts', () => {
    const d = new Date();
    const pays = [
      { reference: 'PAY-1', providerRef: null, amountXof: 25000, status: 'reussi', createdAt: d },
      { reference: 'PAY-2', providerRef: 'CP-2', amountXof: 10000, status: 'reussi', createdAt: d },
      { reference: 'PAY-3', providerRef: null, amountXof: 5000, status: 'en_attente', createdAt: d },
      { reference: 'PAY-4', providerRef: null, amountXof: 7000, status: 'reussi', createdAt: d },
    ];
    const rows = [
      { ref: 'PAY-1', amount: 25000, ok: true, date: '', raw: '' }, // rapproché
      { ref: 'CP-2', amount: 9000, ok: true, date: '', raw: '' }, // montant différent (référence de l'agrégateur)
      { ref: 'PAY-3', amount: 5000, ok: true, date: '', raw: '' }, // payé mais en attente chez nous
      { ref: 'PAY-9', amount: 1000, ok: true, date: '', raw: '' }, // inconnu chez nous
      { ref: 'PAY-5', amount: 1000, ok: false, date: '', raw: '' }, // refusé : ignoré
    ];
    expect(reconcile(rows, pays).summary).toEqual({ lines: 5, matched: 1, montant: 1, statut: 1, absentChezNous: 1, absentDuReleve: 1 });
  });
});

describe('export XLSX', () => {
  it('produit une archive ZIP contenant la feuille, sans formule', () => {
    const b = xlsx([['Nom'], ['=SOMME(A1)']]);
    expect([b[0], b[1]]).toEqual([0x50, 0x4b]);
    const text = new TextDecoder().decode(b);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('t="inlineStr"');
    expect(text).not.toContain('<f>');
  });
});

describe('modèles de messages', async () => {
  const { fill, TEMPLATES } = await import('../src/lib/templates');
  it('remplit les variables et efface les inconnues', () => {
    expect(fill('Candidature {reference} : {programme}', { reference: 'CAND-1', programme: 'Accélérateur' })).toBe('Candidature CAND-1 : Accélérateur');
    expect(fill('Bonjour {inconnue}!', {})).toBe('Bonjour !');
  });
  it('chaque texte par défaut n’utilise que ses variables déclarées', () => {
    for (const t of Object.values(TEMPLATES)) {
      const used = [...t.body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
      expect(used.every((v) => (t.vars as readonly string[]).includes(v))).toBe(true);
    }
  });
});
