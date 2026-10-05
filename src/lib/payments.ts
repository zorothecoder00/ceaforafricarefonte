/* Paiements (CDC §10, §16) : catalogue des prix côté serveur, agrégateur Mobile Money / carte, exécution de la commande.
   - Prestataire réel : CinetPay (Orange Money, MTN MoMo, Wave, Moov, cartes…) — actif si CINETPAY_APIKEY et CINETPAY_SITE_ID sont définis.
   - Sans prestataire : mode « simulation » en développement uniquement ; en production le paiement est refusé proprement.
   CEA ne voit ni ne conserve aucune donnée de carte : la saisie se fait chez l'agrégateur. */
import { and, count, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import * as s from '../db/schema';
import { findCourse, findEvent } from './catalog';
import { invoiceForPayment } from './invoices';
import { message } from './templates';
import { env, isProd } from './env';
import { reference, audit } from './session';
import { contactOf, deliverTickets, newTicketCode } from './tickets';
import { notify } from './notify';

export type Purpose = (typeof s.paymentPurposeEnum.enumValues)[number];
export type Item = { purpose: Purpose; ref: string; label: string; amountXof: number; meta?: Record<string, unknown> };

export const PLANS: Record<string, { label: string; xof: number }> = {
  membre: { label: 'Adhésion Membre — 1 an', xof: 30000 },
  premium: { label: 'Adhésion Premium — 1 an', xof: 90000 },
  entreprise: { label: 'Adhésion Entreprise — 1 an', xof: 250000 },
};
/** Jauge d'un événement (fiche du CMS ou valeur du code) ; Infinity si non limitée. */
export const eventCapacity = async (eventId: string) => (await findEvent(eventId, { hidden: true }))?.capacity ?? Infinity;
const GROUP_DISCOUNT = { min: 5, percent: 10 }; // tarif de groupe

/** Résout un article du catalogue. Les montants ne viennent JAMAIS du navigateur. */
export async function resolveItem(purpose: string, ref: string, extra: { qty?: number; promo?: string } = {}): Promise<Item | null> {
  if (purpose === 'adhesion' && PLANS[ref]) return { purpose, ref, label: PLANS[ref].label, amountXof: PLANS[ref].xof };
  if (purpose === 'cours') {
    // Seuls les cours et événements en ligne sont en vente
    const c = await findCourse(ref);
    return c && c.price ? { purpose, ref, label: `Cours : ${c.t}`, amountXof: c.price } : null;
  }
  if (purpose === 'expert') {
    // ref = « <id de l'expert>:<créneau ISO> »
    const [expertId, ...slot] = ref.split(':');
    const [x] = await db.select({ name: s.user.name, expertise: s.mentorProfile.expertise, price: s.mentorProfile.priceXof }).from(s.mentorProfile).innerJoin(s.user, eq(s.user.id, s.mentorProfile.userId))
      .where(and(eq(s.mentorProfile.userId, expertId), eq(s.mentorProfile.kind, 'expert'), eq(s.mentorProfile.active, true)));
    return x && x.price > 0 ? { purpose, ref, label: `Consultation : ${x.name} (${x.expertise})`, amountXof: x.price, meta: { expertId, slot: slot.join(':') } } : null;
  }
  if (purpose === 'mastermind') return { purpose, ref: 'cotisation', label: 'Cotisation Mastermind — 1 an', amountXof: 180000 };
  if (purpose === 'programme' && ref === 'investor-ready') return { purpose, ref, label: 'Programme Investor Ready', amountXof: 250000 };
  if (purpose === 'mise_en_avant') return { purpose, ref, label: "Mise en avant d'une offre d'emploi (30 jours)", amountXof: 15000 };
  if (purpose === 'recherche') return { purpose, ref: 'premium', label: 'Abonnement Recherche Premium — 1 an', amountXof: 60000 };
  if (purpose === 'billet') {
    const [eventId, idx] = ref.split(':');
    const e = await findEvent(eventId);
    const tk = e?.tk[Number(idx)];
    if (!e || !tk) return null;
    const qty = Math.min(Math.max(1, extra.qty ?? 1), 20);
    let amount = tk.p * qty;
    let promoPct = 0;
    if (extra.promo) {
      const [p] = await db.select().from(s.promoCode).where(eq(s.promoCode.code, extra.promo.trim().toUpperCase()));
      if (p && (!p.eventId || p.eventId === eventId) && (!p.expiresAt || p.expiresAt > new Date()) && (p.maxUses == null || p.used < p.maxUses)) promoPct = p.percent;
    }
    const groupPct = qty >= GROUP_DISCOUNT.min ? GROUP_DISCOUNT.percent : 0;
    amount = Math.round((amount * (100 - Math.max(promoPct, groupPct))) / 100 / 5) * 5; // multiple de 5 (exigence XOF)
    return { purpose, ref, label: `${e.t} — ${tk.n}${qty > 1 ? ` × ${qty}` : ''}`, amountXof: amount, meta: { eventId, ticketType: tk.n, qty, promo: promoPct ? extra.promo?.toUpperCase() : null, unitXof: tk.p } };
  }
  return null;
}

export const provider = () => (env('CINETPAY_APIKEY') && env('CINETPAY_SITE_ID') ? 'cinetpay' : isProd() ? null : 'simulation');

/** Crée le paiement et renvoie l'URL où envoyer l'utilisateur. */
export async function startPayment(userId: string, item: Item, origin: string, customer: { name: string; email?: string | null; phone?: string | null }) {
  const p = provider();
  if (!p) throw new Error('Le paiement en ligne n’est pas encore activé. Contactez-nous pour régler par virement ou Mobile Money.');
  const ref = reference('PAY');
  const [row] = await db.insert(s.payment).values({ reference: ref, userId, purpose: item.purpose, amountXof: item.amountXof, provider: p, metadata: { ref: item.ref, label: item.label, ...item.meta } }).returning({ id: s.payment.id });
  await audit(userId, 'paiement.initie', ref, { purpose: item.purpose, amount: item.amountXof });
  if (p === 'simulation') return { url: `/paiement/simulation?ref=${ref}`, id: row.id, ref };

  const res = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: env('CINETPAY_APIKEY'), site_id: env('CINETPAY_SITE_ID'), transaction_id: ref,
      amount: item.amountXof, currency: 'XOF', description: item.label.slice(0, 120).replace(/[^\p{L}\p{N} .,'-]/gu, ' '),
      notify_url: new URL('/api/paiements/notification', origin).href, return_url: new URL(`/paiement/retour?ref=${ref}`, origin).href,
      channels: 'ALL', lang: 'fr', customer_name: customer.name, customer_email: customer.email ?? undefined, customer_phone_number: customer.phone ?? undefined,
    }),
  });
  const d = (await res.json().catch(() => null)) as { code?: string; message?: string; data?: { payment_url?: string } } | null;
  if (!d?.data?.payment_url) {
    await db.update(s.payment).set({ status: 'echoue' }).where(eq(s.payment.reference, ref));
    throw new Error(`Le prestataire de paiement a refusé la demande (${d?.message ?? res.status}).`);
  }
  return { url: d.data.payment_url, id: row.id, ref };
}

/** Vérifie le statut auprès de CinetPay (source de vérité, jamais le navigateur). */
export async function checkCinetpay(ref: string): Promise<{ status: 'reussi' | 'echoue' | 'en_attente'; method?: string; providerRef?: string; amount?: number }> {
  const res = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: env('CINETPAY_APIKEY'), site_id: env('CINETPAY_SITE_ID'), transaction_id: ref }),
  });
  const d = (await res.json().catch(() => null)) as { data?: { status?: string; payment_method?: string; operator_id?: string; amount?: string } } | null;
  const st = d?.data?.status;
  return { status: st === 'ACCEPTED' ? 'reussi' : st === 'REFUSED' || st === 'CANCELED' ? 'echoue' : 'en_attente', method: d?.data?.payment_method, providerRef: d?.data?.operator_id, amount: Number(d?.data?.amount) };
}

const card = (prefix: string) => `CEA-${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;

/** Marque le paiement réussi (une seule fois) et exécute la commande. */
export async function settle(ref: string, info: { method?: string; providerRef?: string } = {}) {
  const [pay] = await db.select().from(s.payment).where(eq(s.payment.reference, ref));
  if (!pay || pay.status === 'reussi') return pay;
  const [upd] = await db.update(s.payment).set({ status: 'reussi', paidAt: new Date(), method: info.method ?? pay.method, providerRef: info.providerRef ?? pay.providerRef })
    .where(and(eq(s.payment.reference, ref), eq(s.payment.status, 'en_attente'))).returning();
  // Facture automatique (CDC §12) : son échec n'empêche jamais l'exécution de la commande
  if (upd) await invoiceForPayment(upd.id).catch((e) => console.error('[facture]', e instanceof Error ? e.message : e));
  if (!upd || !pay.userId) return upd ?? pay; // déjà traité par un autre appel
  const meta = pay.metadata as Record<string, unknown>;
  const uid = pay.userId;
  const [prof] = await db.select({ country: s.profile.country }).from(s.profile).where(eq(s.profile.userId, uid));

  switch (pay.purpose) {
    case 'adhesion': {
      const end = new Date(); end.setFullYear(end.getFullYear() + 1);
      await db.update(s.membership).set({ status: 'expiree' }).where(and(eq(s.membership.userId, uid), eq(s.membership.status, 'active')));
      const number = card(prof?.country ?? 'AF');
      await db.insert(s.membership).values({ userId: uid, plan: meta.ref as 'membre', cardNumber: number, endsAt: end, paymentId: pay.id });
      await notify(uid, await message('adhesion.activee', { carte: number }), '/espace/carte', { email: true, whatsapp: true });
      break;
    }
    case 'cours':
      await db.insert(s.enrollment).values({ userId: uid, courseId: String(meta.ref) }).onConflictDoNothing();
      await notify(uid, `Inscription confirmée : ${meta.label}`, `/academie/${meta.ref}`, { email: true });
      break;
    case 'billet': {
      const qty = Number(meta.qty ?? 1);
      const [buyer] = await db.select({ name: s.user.name }).from(s.user).where(eq(s.user.id, uid));
      const issued = await db.insert(s.eventTicket).values(Array.from({ length: qty }, () => ({ code: newTicketCode(String(meta.eventId)), eventId: String(meta.eventId), ticketType: String(meta.ticketType), priceXof: Number(meta.unitXof ?? 0), userId: uid, holderName: buyer?.name ?? null, paymentId: pay.id }))).returning();
      await deliverTickets(issued, await contactOf(uid));
      if (meta.promo) await db.update(s.promoCode).set({ used: (await db.select({ u: s.promoCode.used }).from(s.promoCode).where(eq(s.promoCode.code, String(meta.promo))))[0].u + 1 }).where(eq(s.promoCode.code, String(meta.promo)));
      await notify(uid, `Billet${qty > 1 ? 's' : ''} confirmé${qty > 1 ? 's' : ''} : ${meta.label}`, '/espace/billets');
      break;
    }
    case 'expert':
      await db.update(s.mentoringSession).set({ status: 'confirmee' }).where(eq(s.mentoringSession.paymentId, pay.id));
      await notify(uid, `Consultation confirmée : ${meta.label}`, '/espace/mentorat', { email: true });
      break;
    case 'mastermind':
    case 'programme':
      await db.update(s.programmeApplication).set({ data: { paye: true, paiement: ref }, updatedAt: new Date() }).where(and(eq(s.programmeApplication.userId, uid), eq(s.programmeApplication.programme, pay.purpose === 'mastermind' ? 'mastermind' : String(meta.ref))));
      await notify(uid, `Paiement reçu : ${meta.label}`, '/espace/candidatures', { email: true });
      break;
    case 'mise_en_avant':
      await db.update(s.job).set({ featured: true }).where(eq(s.job.id, String(meta.ref)));
      await notify(uid, 'Votre offre est mise en avant pendant 30 jours.', '/espace/recruteur');
      break;
    case 'recherche':
      await db.insert(s.savedItem).values({ userId: uid, kind: 'abonnement', itemId: `recherche-${new Date().getFullYear()}` }).onConflictDoNothing();
      await notify(uid, 'Abonnement Recherche Premium activé.', '/kapital/recherche');
      break;
  }
  await audit(uid, 'paiement.reussi', ref, { purpose: pay.purpose, amount: pay.amountXof });
  return upd;
}

export async function ticketsSold(eventId: string) {
  const [r] = await db.select({ n: count() }).from(s.eventTicket).where(and(eq(s.eventTicket.eventId, eventId), inArray(s.eventTicket.status, ['valide', 'utilise'])));
  return r.n;
}
