/* CEA OS — comptabilité générale SYSCOHADA révisé (prototype › post, pCompta).
   Les écritures sont générées automatiquement par les autres modules (factures émises et encaissées, dépenses et notes de
   frais payées, factures fournisseurs, paie) ; les opérations diverses manuelles restent possibles. Chaque écriture porte un
   pays et un domaine d'intervention (analytique). Une écriture est toujours équilibrée (débit = crédit). */
import { db } from '../db';
import { osLedger } from '../../db/schema/os';
import type { invoice } from '../../db/schema/finance';
import type { Dom } from './ref';

/** Plan de comptes utilisé par CEA OS. */
export const ACCOUNTS: Record<string, string> = {
  '101': 'Capital', '401': 'Fournisseurs', '411': 'Clients', '421': 'Personnel, avances et acomptes', '422': 'Personnel, rémunérations dues', '431': 'Sécurité sociale',
  '443': 'État, TVA facturée', '447': 'État, impôts retenus à la source', '521': 'Banques', '571': 'Caisse', '585': 'Mobile Money (virements de fonds)',
  '601': 'Achats de marchandises', '604': 'Achats stockés de matières et fournitures', '605': 'Autres achats', '618': 'Autres frais de transport',
  '622': 'Locations et charges locatives', '628': 'Frais de télécommunications', '632': "Rémunérations d'intermédiaires et de conseils",
  '637': 'Rémunérations de personnel extérieur', '638': 'Autres charges externes', '661': 'Rémunérations directes versées au personnel', '664': 'Charges sociales',
  '701': 'Ventes de marchandises', '705': 'Travaux facturés', '706': 'Services vendus', '707': 'Produits accessoires (cotisations)', '758': 'Produits divers',
};
export const JOURNALS: Record<string, string> = { VE: 'Ventes', AC: 'Achats', BQ: 'Banque et Mobile Money', OD: 'Opérations diverses', PA: 'Paie' };

/** Domaine d'intervention d'un objet de paiement du site. */
export const PURPOSE_DOM: Record<string, Dom> = { adhesion: 'voix', billet: 'evt', cours: 'aca', programme: 'aca', mastermind: 'mm', expert: 'prj', mise_en_avant: 'tal', recherche: 'kap', sponsoring: 'evt' };

export type Line = [string, number, number];
export async function post(journal: string, label: string, lines: Line[], meta: { country?: string | null; domain?: string | null; ref?: string; by?: string | null; at?: Date }) {
  const d = lines.reduce((a, l) => a + l[1], 0), c = lines.reduce((a, l) => a + l[2], 0);
  if (Math.round(d) !== Math.round(c) || !d) throw new Error('Écriture déséquilibrée.');
  await db.insert(osLedger).values({ journal, label: label.slice(0, 300), lines, country: meta.country ?? null, domain: meta.domain ?? null, ref: meta.ref ?? '', createdBy: meta.by ?? null, ...(meta.at ? { at: meta.at } : {}) });
}

type Inv = typeof invoice.$inferSelect;
const salesAccount = (i: Pick<Inv, 'purpose' | 'domain'>) => (i.purpose === 'adhesion' ? '707' : i.purpose === 'sponsoring' ? '758' : i.domain === 'btp' ? '705' : '706');
export const cashAccount = (method?: string | null) => (method && /mobile|momo|orange|wave|moov|mtn/i.test(method) ? '585' : method === 'especes' ? '571' : '521');
const domOf = (i: Pick<Inv, 'purpose' | 'domain'>) => i.domain ?? PURPOSE_DOM[i.purpose] ?? null;

/** Facture (ou avoir) émise : client au débit, produit et TVA au crédit ; encaissement si elle est déjà payée. */
export async function postInvoice(i: Inv) {
  const ttc = Math.abs(i.totalXof), ht = Math.abs(i.totalHtXof), tax = Math.abs(i.taxXof);
  if (!ttc) return;
  const meta = { country: i.country, domain: domOf(i), ref: i.number, by: i.issuedBy };
  const buyer = (i.buyer as { name?: string })?.name ?? '';
  const sale: Line[] = [['411', ttc, 0], [salesAccount(i), 0, ht], ...(tax ? [['443', 0, tax] as Line] : [])];
  // Un avoir contre-passe la vente
  await post('VE', `${i.kind === 'avoir' ? 'Avoir' : 'Facture'} ${i.number}${buyer ? ' — ' + buyer : ''}`, i.kind === 'avoir' ? sale.map(([a, d, c]) => [a, c, d] as Line) : sale, meta);
  if (i.status === 'payee' && i.kind === 'facture') await postPaid(i, i.paymentMethod);
}
/** Encaissement d'une facture. */
export async function postPaid(i: Inv, method?: string | null) {
  const ttc = Math.abs(i.totalXof);
  if (!ttc) return;
  await post('BQ', `Encaissement ${i.number}`, [[cashAccount(method), ttc, 0], ['411', 0, ttc]], { country: i.country, domain: domOf(i), ref: i.number });
}

/** Soldes par compte : { compte: [débit, crédit] }. */
export function balances(rows: { lines: Line[] }[]) {
  const b: Record<string, [number, number]> = {};
  for (const r of rows) for (const [a, d, c] of r.lines) { b[a] ??= [0, 0]; b[a][0] += d; b[a][1] += c; }
  return b;
}

/** Liste de contrôle de la clôture mensuelle (la dernière étape revient à la Direction générale). */
export const CLOSING = ['Rapprochements bancaires et Mobile Money', 'Factures fournisseurs non parvenues', "Produits constatés d'avance", 'Paie du mois comptabilisée', 'Immobilisations et amortissements', 'Revue analytique par domaine', 'Validation de la Direction générale'];
/** Période à clôturer : le mois précédent (AAAA-MM). */
export const closingPeriod = (d = new Date()) => { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`; };
