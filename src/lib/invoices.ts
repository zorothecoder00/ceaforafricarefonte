/* Factures et avoirs (CDC §12, finance) : numérotation continue par année et par type, sans trou (verrou de transaction),
   montants en FCFA entiers, données de l'acheteur figées à l'émission. Une facture émise ne se modifie pas : on émet un avoir. */
import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { invoice } from '../db/schema/finance';
import { payment, profile } from '../db/schema/app';
import { user } from '../db/schema/auth';
import { getSetting } from './settings';

type Invoice = typeof invoice.$inferSelect;
export type Line = { label: string; qty: number; unitXof: number };
export type Buyer = { name: string; email?: string | null; company?: string | null; taxId?: string | null; address?: string | null };

const PREFIX = { facture: 'FAC', avoir: 'AV' } as const;
export const formatNumber = (kind: 'facture' | 'avoir', year: number, seq: number) => `${PREFIX[kind]}-${year}-${String(seq).padStart(6, '0')}`;

/** Montants : HT = somme des lignes ; taxe en pour mille, arrondie au FCFA ; TTC = HT + taxe. */
export function totals(lines: Line[], rate: number) {
  const ht = lines.reduce((n, l) => n + Math.round(l.qty * l.unitXof), 0);
  const tax = Math.round((ht * rate) / 1000);
  return { ht, tax, ttc: ht + tax };
}

/** Émet une facture ou un avoir avec le prochain numéro de la série (verrou : deux émissions simultanées ne prennent pas le même numéro). */
export async function issue(v: Omit<typeof invoice.$inferInsert, 'number' | 'year' | 'seq'>): Promise<Invoice> {
  const year = new Date().getFullYear();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`facturation-${v.kind}-${year}`}))`);
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${invoice.seq}), 0)::int` }).from(invoice).where(and(eq(invoice.kind, v.kind ?? 'facture'), eq(invoice.year, year)));
    const seq = max + 1;
    const [row] = await tx.insert(invoice).values({ ...v, year, seq, number: formatNumber(v.kind ?? 'facture', year, seq) }).returning();
    return row;
  });
}

/** Facture d'un paiement réussi (une seule par paiement ; sans effet si elle existe déjà). Le prix payé est TTC. */
export async function invoiceForPayment(paymentId: string): Promise<Invoice | null> {
  const [existing] = await db.select().from(invoice).where(and(eq(invoice.paymentId, paymentId), eq(invoice.kind, 'facture')));
  if (existing) return existing;
  const [row] = await db.select({ p: payment, name: user.name, email: user.email, company: profile.companyName }).from(payment)
    .leftJoin(user, eq(user.id, payment.userId)).leftJoin(profile, eq(profile.userId, payment.userId)).where(eq(payment.id, paymentId));
  if (!row || row.p.status !== 'reussi') return null;
  const { rate } = await getSetting('fiscalite');
  const label = (row.p.metadata as { label?: string }).label ?? row.p.purpose;
  // Le montant payé est toutes taxes comprises : on en déduit le hors-taxe
  const ht = Math.round((row.p.amountXof * 1000) / (1000 + rate));
  const lines: Line[] = [{ label, qty: 1, unitXof: ht }];
  return issue({
    kind: 'facture', paymentId, userId: row.p.userId, purpose: row.p.purpose,
    buyer: { name: row.name ?? '—', email: row.email?.endsWith('@telephone.cea4africa.com') ? null : row.email, company: row.company ?? null },
    lines, totalHtXof: ht, taxRate: rate, taxXof: row.p.amountXof - ht, totalXof: row.p.amountXof,
    status: 'payee', paidAt: row.p.paidAt ?? new Date(), paymentMethod: row.p.method,
  });
}

/** Avoir (remboursement total ou partiel) sur une facture : montants négatifs, même taux de taxe. */
export async function creditNote(original: Invoice, amountXof: number, reason: string, by: string) {
  const ht = Math.round((amountXof * 1000) / (1000 + original.taxRate));
  return issue({
    kind: 'avoir', originalId: original.id, paymentId: original.paymentId, userId: original.userId, orgId: original.orgId, purpose: original.purpose, buyer: original.buyer,
    lines: [{ label: `Avoir sur ${original.number} — ${reason}`, qty: 1, unitXof: -ht }], totalHtXof: -ht, taxRate: original.taxRate, taxXof: -(amountXof - ht), totalXof: -amountXof,
    status: 'payee', paidAt: new Date(), notes: reason, issuedBy: by,
  });
}
