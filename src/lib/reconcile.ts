/* Rapprochement des paiements (CDC §12, finance) : relevé CSV de l'agrégateur (CinetPay, PayDunya, FedaPay…) comparé aux paiements
   enregistrés. Aucune écriture automatique : le résultat liste les écarts à traiter par l'équipe finance.
   Colonnes reconnues par leur intitulé (référence, montant, statut, date), séparateur « ; » ou « , », guillemets gérés. */

export type StatementRow = { ref: string; amount: number; ok: boolean; date: string; raw: string };
export type PaymentLite = { reference: string; providerRef: string | null; amountXof: number; status: string; createdAt: Date };
export type Gap = { kind: 'montant' | 'absent_chez_nous' | 'absent_du_releve' | 'statut'; ref: string; detail: string };

/** Lecture CSV : séparateur deviné sur la première ligne, champs entre guillemets, guillemets doublés. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = {
  ref: ['transactionid', 'transid', 'cpmtransid', 'reference', 'ref', 'referencemarchand', 'idtransaction', 'merchantreference', 'orderid'],
  amount: ['amount', 'montant', 'cpmamount', 'montantxof', 'total'],
  status: ['status', 'statut', 'etat', 'cpmresult', 'resultat'],
  date: ['date', 'paymentdate', 'datepaiement', 'createdat', 'cpmtransdate'],
};
const OK = ['accepted', 'success', 'succes', 'reussi', 'paye', 'paid', 'complete', 'completed', '00', 'approved', 'valide'];

/** Lignes du relevé ; erreur si aucune colonne de référence ou de montant n'est reconnue. */
export function readStatement(text: string): { rows: StatementRow[] } | { error: string } {
  const all = parseCsv(text);
  if (all.length < 2) return { error: 'Relevé vide ou illisible.' };
  const head = all[0].map(norm);
  const find = (k: keyof typeof ALIASES) => head.findIndex((h) => ALIASES[k].includes(h));
  const [iRef, iAmt, iSt, iDate] = [find('ref'), find('amount'), find('status'), find('date')];
  if (iRef < 0 || iAmt < 0) return { error: `Colonnes introuvables : il faut une colonne de référence (${ALIASES.ref.slice(0, 3).join(', ')}…) et une colonne de montant.` };
  const rows = all.slice(1).map((r) => {
    const amount = Number((r[iAmt] ?? '').replace(/\s| /g, '').replace(/,(\d{1,2})$/, '.$1').replace(/[^\d.-]/g, ''));
    return { ref: (r[iRef] ?? '').trim(), amount: Math.round(amount), ok: iSt < 0 || OK.includes(norm(r[iSt] ?? '')), date: iDate >= 0 ? (r[iDate] ?? '').trim() : '', raw: r.join(' | ').slice(0, 200) };
  }).filter((r) => r.ref);
  return { rows };
}

/** Compare le relevé aux paiements de la période. */
export function reconcile(rows: StatementRow[], payments: PaymentLite[]) {
  const byRef = new Map<string, PaymentLite>();
  for (const p of payments) { byRef.set(p.reference, p); if (p.providerRef) byRef.set(p.providerRef, p); }
  const seen = new Set<string>();
  const gaps: Gap[] = [];
  let matched = 0;
  for (const r of rows.filter((x) => x.ok)) {
    const p = byRef.get(r.ref);
    if (!p) { gaps.push({ kind: 'absent_chez_nous', ref: r.ref, detail: `${r.amount} FCFA encaissés chez l'agrégateur${r.date ? ` le ${r.date}` : ''}, sans paiement correspondant` }); continue; }
    seen.add(p.reference);
    if (p.amountXof !== r.amount) gaps.push({ kind: 'montant', ref: p.reference, detail: `${p.amountXof} FCFA attendus, ${r.amount} FCFA au relevé` });
    else if (p.status !== 'reussi') gaps.push({ kind: 'statut', ref: p.reference, detail: `payé au relevé mais « ${p.status} » chez nous (paiement à confirmer)` });
    else matched++;
  }
  for (const p of payments.filter((x) => x.status === 'reussi' && !seen.has(x.reference))) gaps.push({ kind: 'absent_du_releve', ref: p.reference, detail: `${p.amountXof} FCFA marqués payés chez nous, absents du relevé` });
  const count = (k: Gap['kind']) => gaps.filter((g) => g.kind === k).length;
  return { summary: { lines: rows.length, matched, montant: count('montant'), statut: count('statut'), absentChezNous: count('absent_chez_nous'), absentDuReleve: count('absent_du_releve') }, gaps };
}
