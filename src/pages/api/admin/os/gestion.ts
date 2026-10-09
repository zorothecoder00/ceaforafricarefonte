/* CEA OS — gestion (prototype : Finance et trésorerie, Comptabilité, Achats et stocks, Contrats et juridique).
   POST { action, … } :
   invoice.create { client, label, amount, domain, country, due? } · invoice.pay { id, method } · invoice.remind
   receipt.create { source, amount, ref } · receipt.match { id, invoiceId } · receipt.auto
   budget.revise { domain, budget } · treasury.create { name, account, balance } · treasury.update { id, balance }
   od.create { label, debit, credit, amount, domain, country } · closing.toggle { i, checked }
   po.receive { id } · po.invoice { id, amount } · stock.create { code, label, unit, min, country, unitCost } · stock.out { code, qty, dest }
   supplier.create { name, category, country, iban } · supplier.verify { id }
   contract.sign { id } · contract.renew { id }
   Chaque action est journalisée ; les écritures comptables sont générées automatiquement. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { invoice } from '../../../../db/schema/finance';
import { osReceipt, osBudget, osTreasury, osClosing, osPo, osStockItem, osStockMove, osSupplier, osContract } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, scopeState } from '../../../../lib/os/core';
import { notifyStaff, engageBudget } from '../../../../lib/os/approvals';
import { issue } from '../../../../lib/invoices';
import { getSetting } from '../../../../lib/settings';
import { sendEmail } from '../../../../lib/messaging';
import { post, postPaid, ACCOUNTS, CLOSING, closingPeriod } from '../../../../lib/os/ledger';
import { suggest } from '../../../../lib/os/gestion';
import { DK, PK, fcfa, dstr } from '../../../../lib/os/ref';

export const prerender = false;

const Dom = z.enum(DK as [string, ...string[]]);
const Country = z.enum(PK as [string, ...string[]]);
const Amount = z.coerce.number().int().positive('Montant invalide.').max(1e13);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invoice.create'), client: z.string().trim().min(2, 'Indiquez le client.').max(200), label: z.string().trim().max(200).default('Prestation'), amount: Amount, domain: Dom, country: Country, due: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default('') }),
  z.object({ action: z.literal('invoice.pay'), id: z.uuid(), method: z.enum(['virement', 'cheque', 'especes', 'mobile_money', 'carte']).default('virement') }),
  z.object({ action: z.literal('invoice.remind') }),
  z.object({ action: z.literal('receipt.create'), source: z.enum(['Orange Money', 'MTN MoMo', 'Wave', 'Moov Money', 'Virement']), amount: Amount, ref: z.string().trim().max(120).default('') }),
  z.object({ action: z.literal('receipt.match'), id: z.uuid(), invoiceId: z.uuid() }),
  z.object({ action: z.literal('receipt.auto') }),
  z.object({ action: z.literal('budget.revise'), domain: Dom, budget: z.coerce.number().int().min(0).max(1e13) }),
  z.object({ action: z.literal('treasury.create'), name: z.string().trim().min(2).max(120), account: z.enum(['521', '585', '571']), balance: z.coerce.number().int().min(-1e13).max(1e13) }),
  z.object({ action: z.literal('treasury.update'), id: z.uuid(), balance: z.coerce.number().int().min(-1e13).max(1e13) }),
  z.object({ action: z.literal('od.create'), label: z.string().trim().min(3, 'Indiquez le libellé.').max(200), debit: z.string(), credit: z.string(), amount: Amount, domain: Dom, country: Country }),
  z.object({ action: z.literal('closing.toggle'), i: z.coerce.number().int().min(0).max(CLOSING.length - 1), checked: z.boolean() }),
  z.object({ action: z.literal('po.receive'), id: z.string().max(40) }),
  z.object({ action: z.literal('po.invoice'), id: z.string().max(40), amount: Amount }),
  z.object({ action: z.literal('stock.create'), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, 'Code article : lettres, chiffres et tirets.'), label: z.string().trim().min(2).max(120), unit: z.string().trim().min(1).max(30), min: z.coerce.number().int().min(0), country: Country, unitCost: z.coerce.number().int().min(0) }),
  z.object({ action: z.literal('stock.out'), code: z.string().max(20), qty: z.coerce.number().int().positive('Quantité invalide.'), dest: z.string().trim().max(200).default('') }),
  z.object({ action: z.literal('supplier.create'), name: z.string().trim().min(2, 'Indiquez la raison sociale.').max(160), category: z.string().trim().max(80).default(''), country: Country, iban: z.string().trim().max(60).default('') }),
  z.object({ action: z.literal('supplier.verify'), id: z.string().max(20) }),
  z.object({ action: z.literal('contract.sign'), id: z.string().max(20) }),
  z.object({ action: z.literal('contract.renew'), id: z.string().max(20) }),
]);

const FIN = 'dg fin';
const SPEC: Record<string, string> = {
  'invoice.create': 'dg fin rep chef dirreg', 'invoice.pay': FIN, 'invoice.remind': 'dg fin dirreg rep chef',
  'receipt.create': FIN, 'receipt.match': FIN, 'receipt.auto': FIN, 'budget.revise': FIN, 'treasury.create': FIN, 'treasury.update': FIN,
  'od.create': FIN, 'closing.toggle': FIN,
  'po.receive': 'dg fin chef dirreg rep cond', 'po.invoice': FIN, 'stock.create': FIN, 'stock.out': 'dg fin chef dirreg rep cond', 'supplier.create': FIN, 'supplier.verify': FIN,
  'contract.sign': 'dg jur fin chef', 'contract.renew': 'dg jur fin chef',
};

async function payInvoice(id: string, method: string) {
  const [i] = await db.update(invoice).set({ status: 'payee', paidAt: new Date(), paymentMethod: method }).where(and(eq(invoice.id, id), eq(invoice.status, 'a_payer'))).returning();
  if (i) await postPaid(i, method);
  return i;
}

export const POST: APIRoute = async ({ locals, request, cookies }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const c = await osApi(locals.user, SPEC[b.action]);
  if (c instanceof Response) return c;
  const actor = locals.user!.id, me = c.me;
  const sc = scopeState(c, cookies);

  switch (b.action) {
    case 'invoice.create': {
      if (!sc.inScope({ country: b.country, domain: b.domain })) return fail('Ce pays ou ce domaine est hors de votre périmètre.', 403);
      const fisc = await getSetting('fiscalite');
      const ht = Math.round((b.amount * 1000) / (1000 + fisc.rate)), tax = b.amount - ht;
      const due = b.due || new Date(Date.now() + fisc.dueDays * 864e5).toISOString().slice(0, 10);
      const inv = await issue({ kind: 'facture', buyer: { name: b.client }, purpose: 'autre', lines: [{ label: b.label, qty: 1, unitXof: ht }], totalHtXof: ht, taxRate: fisc.rate, taxXof: tax, totalXof: b.amount, status: 'a_payer', dueOn: due, issuedBy: actor, country: b.country, domain: b.domain });
      await audit(actor, 'os.facture.emission', inv.number, { montant: b.amount });
      return json({ ok: true, message: `${inv.number} émise ; écriture de vente générée.` });
    }
    case 'invoice.pay': {
      const i = await payInvoice(b.id, b.method);
      if (!i) return fail('Facture introuvable ou déjà soldée.');
      await audit(actor, 'os.facture.encaissement', i.number);
      return json({ ok: true, message: 'Encaissement enregistré, écriture générée.' });
    }
    case 'invoice.remind': {
      const today = new Date().toISOString().slice(0, 10);
      const late = (await db.select().from(invoice).where(and(eq(invoice.kind, 'facture'), eq(invoice.status, 'a_payer'), sql`${invoice.dueOn} < ${today}`))).filter((i) => sc.inScope({ country: i.country, domain: i.domain }));
      let sent = 0;
      for (const i of late) {
        const to = (i.buyer as { email?: string | null }).email;
        if (!to) continue;
        await sendEmail(to, `Relance — facture ${i.number}`, `Bonjour,\n\nSauf erreur de notre part, la facture ${i.number} de ${fcfa(i.totalXof)}, échue le ${dstr(i.dueOn)}, reste à régler.\nMerci de procéder au paiement ou de nous contacter.\n\n— CEA FOR AFRICA`).then(() => sent++, () => {});
      }
      await audit(actor, 'os.facture.relance', `${late.length} facture(s)`, { envoyees: sent });
      return json({ ok: true, message: `${late.length} facture(s) en retard : ${sent} relance(s) envoyée(s) par e-mail${late.length - sent ? ` ; ${late.length - sent} sans adresse e-mail (à relancer par téléphone)` : ''}.` });
    }
    case 'receipt.create': {
      await db.insert(osReceipt).values({ source: b.source, amount: b.amount, ref: b.ref, createdBy: actor });
      await audit(actor, 'os.encaissement.saisie', b.ref, { montant: b.amount, canal: b.source });
      return json({ ok: true, message: 'Encaissement enregistré : à rapprocher.' });
    }
    case 'receipt.match': case 'receipt.auto': {
      const recs = await db.select().from(osReceipt).where(eq(osReceipt.status, 'Non rapproché'));
      const unpaid = await db.select().from(invoice).where(and(eq(invoice.kind, 'facture'), eq(invoice.status, 'a_payer')));
      const pairs = b.action === 'receipt.match' ? [[b.id, b.invoiceId]] : recs.map((r) => { const s = suggest(r, unpaid); return s && s.score >= 90 ? [r.id, s.inv.id] : null; }).filter(Boolean) as string[][];
      let n = 0;
      for (const [rid, iid] of pairs) {
        const r = recs.find((x) => x.id === rid);
        if (!r) continue;
        const i = await payInvoice(iid, r.source === 'Virement' ? 'virement' : 'mobile_money');
        if (!i) continue;
        await db.update(osReceipt).set({ status: 'Rapproché', invoiceId: i.id }).where(eq(osReceipt.id, r.id));
        await audit(actor, 'os.rapprochement', `${r.ref} ↔ ${i.number}`);
        n++;
      }
      if (b.action === 'receipt.match' && !n) return fail('Rapprochement impossible : encaissement ou facture déjà traités.');
      return json({ ok: true, message: b.action === 'receipt.auto' ? `${n} rapprochement(s) validé(s).` : 'Rapprochement validé : facture soldée, écriture générée.' });
    }
    case 'budget.revise': {
      const year = new Date().getFullYear();
      const [old] = await db.select().from(osBudget).where(and(eq(osBudget.year, year), eq(osBudget.domain, b.domain)));
      await db.insert(osBudget).values({ year, domain: b.domain, budget: b.budget }).onConflictDoUpdate({ target: [osBudget.year, osBudget.domain], set: { budget: b.budget, updatedAt: new Date() } });
      await audit(actor, 'os.budget.revision', b.domain, { avant: old?.budget ?? 0, apres: b.budget });
      return json({ ok: true, message: 'Budget révisé.' });
    }
    case 'treasury.create': {
      await db.insert(osTreasury).values({ name: b.name, account: b.account, balance: b.balance });
      await audit(actor, 'os.tresorerie.compte', b.name);
      return json({ ok: true, message: 'Compte ajouté.' });
    }
    case 'treasury.update': {
      const [t] = await db.update(osTreasury).set({ balance: b.balance, updatedAt: new Date() }).where(eq(osTreasury.id, b.id)).returning();
      if (!t) return fail('Compte introuvable.', 404);
      await audit(actor, 'os.tresorerie.solde', t.name, { solde: b.balance });
      return json({ ok: true, message: 'Solde mis à jour.' });
    }
    case 'od.create': {
      if (!ACCOUNTS[b.debit] || !ACCOUNTS[b.credit]) return fail('Compte inconnu.');
      if (b.debit === b.credit) return fail('Les comptes doivent être différents.');
      await post('OD', b.label, [[b.debit, b.amount, 0], [b.credit, 0, b.amount]], { country: b.country, domain: b.domain, ref: 'OD manuelle', by: actor });
      await audit(actor, 'os.ecriture.manuelle', b.label, { montant: b.amount });
      return json({ ok: true, message: 'Écriture équilibrée enregistrée.' });
    }
    case 'closing.toggle': {
      if (b.i === CLOSING.length - 1 && c.prof !== 'dg' && !c.superuser) return fail('La validation finale revient à la Direction générale.', 403);
      const period = closingPeriod();
      const [row] = await db.select().from(osClosing).where(eq(osClosing.period, period));
      const items = row?.items ?? CLOSING.map(() => false);
      items[b.i] = b.checked;
      const closed = items.every(Boolean) ? new Date() : null;
      await db.insert(osClosing).values({ period, items, closedAt: closed }).onConflictDoUpdate({ target: osClosing.period, set: { items, closedAt: closed } });
      await audit(actor, 'os.cloture', `${period} — ${CLOSING[b.i]}`, { fait: b.checked });
      return json({ ok: true, message: closed ? `Période ${period} clôturée.` : 'Étape enregistrée.' });
    }
    case 'po.receive': {
      const [po] = await db.update(osPo).set({ status: 'Livré' }).where(and(eq(osPo.id, b.id), eq(osPo.status, 'Commandé'))).returning();
      if (!po) return fail('Bon de commande introuvable ou déjà réceptionné.');
      if (po.itemCode && po.qty) {
        await db.update(osStockItem).set({ qty: sql`${osStockItem.qty} + ${po.qty}` }).where(eq(osStockItem.code, po.itemCode));
        await db.insert(osStockMove).values({ code: po.itemCode, type: 'Entrée', qty: po.qty, ref: po.id, by: me?.id ?? null });
      }
      await audit(actor, 'os.achat.reception', po.id);
      return json({ ok: true, message: `Réception enregistrée${po.itemCode ? ' ; stock mis à jour' : ''}.` });
    }
    case 'po.invoice': {
      const [po] = await db.select().from(osPo).where(eq(osPo.id, b.id));
      if (!po || po.status !== 'Livré') return fail('La facture fournisseur se saisit après la réception.');
      // Contrôle à trois voies : commande, réception, facture (écart toléré : 2 %)
      if (Math.abs(b.amount - po.amount) > po.amount * 0.02) return fail('Écart de plus de 2 % avec la commande : facture bloquée pour contrôle.');
      const meta = { country: po.country, domain: po.domain, ref: po.id, by: actor };
      await post('AC', `Facture ${po.id} — ${po.label}`, [[po.itemCode ? '604' : '605', b.amount, 0], ['401', 0, b.amount]], meta);
      await post('BQ', `Paiement fournisseur ${po.id}`, [['401', b.amount, 0], ['521', 0, b.amount]], meta);
      await engageBudget(po.domain, b.amount, 'realised');
      await db.update(osPo).set({ status: 'Facturé' }).where(eq(osPo.id, po.id));
      await audit(actor, 'os.achat.facture', po.id, { montant: b.amount });
      return json({ ok: true, message: 'Facture conforme : comptabilisée et payée.' });
    }
    case 'stock.create': {
      const [ex] = await db.select().from(osStockItem).where(eq(osStockItem.code, b.code));
      if (ex) return fail('Ce code article existe déjà.');
      await db.insert(osStockItem).values({ code: b.code, label: b.label, unit: b.unit, min: b.min, country: b.country, unitCost: b.unitCost });
      await audit(actor, 'os.stock.article', b.code);
      return json({ ok: true, message: 'Article créé.' });
    }
    case 'stock.out': {
      const [s] = await db.select().from(osStockItem).where(eq(osStockItem.code, b.code));
      if (!s) return fail('Article introuvable.', 404);
      if (b.qty > s.qty) return fail(`Quantité invalide (disponible : ${s.qty}).`);
      const q = s.qty - b.qty;
      await db.update(osStockItem).set({ qty: q }).where(eq(osStockItem.code, s.code));
      await db.insert(osStockMove).values({ code: s.code, type: 'Sortie', qty: b.qty, ref: b.dest || '—', by: me?.id ?? null });
      if (q < s.min) { const ps = await allStaff(); await notifyStaff(ps.filter((x) => x.prof === 'fin' && x.active).map((x) => x.id), `Stock bas : ${s.label} (${q} ${s.unit})`, '/os/achats?t=st', ps); }
      await audit(actor, 'os.stock.sortie', s.code, { quantite: b.qty });
      return json({ ok: true, message: q < s.min ? 'Sortie enregistrée. Stock sous le seuil : la finance est alertée.' : 'Sortie enregistrée.' });
    }
    case 'supplier.create': {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osSupplier);
      const iban = b.iban.replace(/\s/g, '');
      await db.insert(osSupplier).values({ id: `FRN-${10 + n}`, name: b.name, category: b.category, country: b.country, iban: iban ? iban.replace(/.(?=.{4})/g, '•') : '', createdBy: actor });
      await audit(actor, 'os.fournisseur.creation', b.name);
      return json({ ok: true, message: 'Fournisseur créé : à faire vérifier par une seconde personne.' });
    }
    case 'supplier.verify': {
      const [s] = await db.select().from(osSupplier).where(eq(osSupplier.id, b.id));
      if (!s) return fail('Fournisseur introuvable.', 404);
      if (s.createdBy === actor) return fail('Double contrôle : la vérification doit être faite par une autre personne que le créateur.', 403);
      await db.update(osSupplier).set({ status: 'Vérifié', verifiedBy: actor }).where(eq(osSupplier.id, s.id));
      await audit(actor, 'os.fournisseur.verification', s.name);
      return json({ ok: true, message: 'Fournisseur vérifié.' });
    }
    case 'contract.sign': {
      const [k] = await db.update(osContract).set({ status: 'En vigueur', start: new Date() }).where(and(eq(osContract.id, b.id), eq(osContract.status, 'En signature'))).returning();
      if (!k) return fail('Contrat introuvable ou déjà signé.');
      await audit(actor, 'os.contrat.signature', k.id);
      return json({ ok: true, message: 'Contrat signé ; preuve archivée dans le journal.' });
    }
    case 'contract.renew': {
      const [k] = await db.update(osContract).set({ end: sql`${osContract.end} + interval '365 days'` }).where(eq(osContract.id, b.id)).returning();
      if (!k) return fail('Contrat introuvable.', 404);
      await audit(actor, 'os.contrat.renouvellement', k.id);
      return json({ ok: true, message: `Contrat renouvelé jusqu'au ${dstr(k.end)}.` });
    }
  }
  return fail('Action inconnue.');
};
