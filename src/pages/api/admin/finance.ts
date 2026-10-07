/* API finance (CDC §12). Droits : objet « paiements » (§18) — C pour émettre une facture manuelle, M pour enregistrer un encaissement,
   V pour les avoirs, le rattrapage des factures et le rapprochement. Chaque action est journalisée.
   POST { action, … } :
   - backfill                                      → factures des paiements réussis qui n'en ont pas (ordre chronologique)
   - manual { orgId?, buyer, purpose, lines, notes? } → facture à payer (sponsoring, prestation réglée par virement)
   - paid { id, method, paidAt }                   → encaissement d'une facture manuelle
   - credit { id, amountXof, reason }              → avoir (remboursement total ou partiel)
   - reconcile { provider, fileName, csv, from, to } → rapprochement avec le relevé de l'agrégateur */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { payment } from '../../../db/schema/app';
import { invoice, reconciliation } from '../../../db/schema/finance';
import { crmOrg } from '../../../db/schema/crm';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { issue, invoiceForPayment, creditNote, totals } from '../../../lib/invoices';
import { postPaid } from '../../../lib/os/ledger';
import { readStatement, reconcile } from '../../../lib/reconcile';
import { getSetting } from '../../../lib/settings';

export const prerender = false;

const id = z.uuid();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('backfill') }),
  z.object({
    action: z.literal('manual'), orgId: z.preprocess((v) => (v === '' ? null : v), id.nullish()),
    buyer: z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().max(160).nullish(), company: z.string().trim().max(160).nullish(), taxId: z.string().trim().max(60).nullish(), address: z.string().trim().max(300).nullish() }),
    purpose: z.enum(['sponsoring', 'programme', 'adhesion', 'billet', 'cours', 'autre']),
    lines: z.array(z.object({ label: z.string().trim().min(2).max(200), qty: z.coerce.number().int().min(1).max(10000), unitXof: z.coerce.number().int().min(1).max(1e12) })).min(1).max(30),
    notes: z.string().trim().max(1000).nullish(),
  }),
  z.object({ action: z.literal('paid'), id, method: z.enum(['virement', 'cheque', 'especes', 'mobile_money', 'carte']), paidAt: z.iso.date() }),
  z.object({ action: z.literal('credit'), id, amountXof: z.coerce.number().int().min(1), reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal('reconcile'), provider: z.string().trim().min(2).max(40), fileName: z.string().trim().max(200), csv: z.string().min(10).max(4_000_000), from: z.iso.date(), to: z.iso.date() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', '));
  const b = p.data;
  const ip = clientIp(request);
  const u = staffApi(locals.user, 'paiements', b.action === 'manual' ? 'C' : b.action === 'paid' ? 'M' : 'V');
  if (u instanceof Response) return u;

  switch (b.action) {
    case 'backfill': {
      const missing = await db.select({ id: payment.id }).from(payment)
        .leftJoin(invoice, and(eq(invoice.paymentId, payment.id), eq(invoice.kind, 'facture')))
        .where(and(eq(payment.status, 'reussi'), isNull(invoice.id))).orderBy(asc(payment.paidAt)).limit(2000);
      let n = 0;
      for (const m of missing) if (await invoiceForPayment(m.id)) n++;
      await audit(u.id, 'finance.factures.rattrapage', undefined, { count: n }, ip);
      return json({ ok: true, message: n ? `${n} facture${n > 1 ? 's' : ''} émise${n > 1 ? 's' : ''}.` : 'Tous les paiements réussis ont déjà leur facture.' });
    }
    case 'manual': {
      if (b.orgId) { const [o] = await db.select({ id: crmOrg.id }).from(crmOrg).where(eq(crmOrg.id, b.orgId)); if (!o) return fail('Organisation introuvable.'); }
      const fisc = await getSetting('fiscalite');
      const t = totals(b.lines, fisc.rate);
      const due = new Date(Date.now() + fisc.dueDays * 864e5).toISOString().slice(0, 10);
      const inv = await issue({ kind: 'facture', orgId: b.orgId ?? null, buyer: b.buyer, purpose: b.purpose, lines: b.lines, totalHtXof: t.ht, taxRate: fisc.rate, taxXof: t.tax, totalXof: t.ttc, status: 'a_payer', dueOn: due, notes: b.notes ?? null, issuedBy: u.id });
      await audit(u.id, 'finance.facture.emission', inv.number, { total: t.ttc }, ip);
      return json({ ok: true, message: `Facture ${inv.number} émise.`, redirect: `/facture/${inv.number}` });
    }
    case 'paid': {
      const [inv] = await db.select().from(invoice).where(eq(invoice.id, b.id));
      if (!inv || inv.kind !== 'facture') return fail('Facture introuvable.', 404);
      if (inv.status !== 'a_payer') return fail('Cette facture n’est pas en attente de paiement.');
      const [paid] = await db.update(invoice).set({ status: 'payee', paidAt: new Date(`${b.paidAt}T12:00:00Z`), paymentMethod: b.method }).where(eq(invoice.id, b.id)).returning();
      if (paid) await postPaid(paid, b.method).catch(() => {}); // comptabilité CEA OS
      await audit(u.id, 'finance.facture.encaissement', inv.number, { method: b.method }, ip);
      return json({ ok: true, message: 'Encaissement enregistré.' });
    }
    case 'credit': {
      const [inv] = await db.select().from(invoice).where(eq(invoice.id, b.id));
      if (!inv || inv.kind !== 'facture') return fail('Facture introuvable.', 404);
      const [{ credited }] = await db.select({ credited: sql<number>`coalesce(-sum(${invoice.totalXof}), 0)::float` }).from(invoice).where(and(eq(invoice.kind, 'avoir'), eq(invoice.originalId, inv.id)));
      const left = inv.totalXof - credited;
      if (b.amountXof > left) return fail(`L’avoir dépasse le reste de la facture (${left} FCFA).`);
      const av = await creditNote(inv, b.amountXof, b.reason, u.id);
      // Facture non encaissée entièrement annulée : elle n'est plus due
      if (inv.status === 'a_payer' && b.amountXof === left) await db.update(invoice).set({ status: 'annulee' }).where(eq(invoice.id, inv.id));
      await audit(u.id, 'finance.avoir', av.number, { facture: inv.number, amount: b.amountXof, reason: b.reason }, ip);
      return json({ ok: true, message: `Avoir ${av.number} émis.` });
    }
    case 'reconcile': {
      const st = readStatement(b.csv);
      if ('error' in st) return fail(st.error);
      const pays = await db.select({ reference: payment.reference, providerRef: payment.providerRef, amountXof: payment.amountXof, status: payment.status, createdAt: payment.createdAt }).from(payment)
        .where(and(gte(payment.createdAt, new Date(`${b.from}T00:00:00Z`)), lte(payment.createdAt, new Date(`${b.to}T23:59:59Z`))));
      const r = reconcile(st.rows, pays);
      const [row] = await db.insert(reconciliation).values({ provider: b.provider, fileName: b.fileName, periodFrom: b.from, periodTo: b.to, summary: r.summary, items: r.gaps, createdBy: u.id }).returning({ id: reconciliation.id });
      await audit(u.id, 'finance.rapprochement', row.id, r.summary, ip);
      return json({ ok: true, message: `Rapprochement : ${r.summary.matched} paiement(s) concordant(s), ${r.gaps.length} écart(s).`, redirect: `/admin/finance?onglet=rapprochement&r=${row.id}` });
    }
  }
};
