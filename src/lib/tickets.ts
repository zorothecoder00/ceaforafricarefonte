/* Billetterie (CDC §7.3) : émission, envoi du billet QR (e-mail et WhatsApp), transfert, annulation et remboursement,
   liste d'attente prévenue quand une place se libère. */
import { and, asc, eq, isNull } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from './db';
import * as s from '../db/schema';
import { EVENTS, dateFr } from '../data/site';
import { sendEmail, sendWhatsApp } from './messaging';
import { verifyUrl } from './qr';
import { notify } from './notify';

/** Conditions d'annulation : remboursement des billets payants jusqu'à J-7, transfert possible jusqu'au début de l'événement. */
export const REFUND_DAYS = 7;

const site = () => process.env.BETTER_AUTH_URL ?? process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';
export const newTicketCode = (eventId: string) => `TKT-${eventId.toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
export const eventOf = (id: string) => EVENTS.find((e) => e.id === id);
const daysBefore = (date: string) => (new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000;
const escHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type T = typeof s.eventTicket.$inferSelect;

/** Envoie les billets (QR en image PNG intégrée) par e-mail, et leurs codes par WhatsApp si un numéro est connu. */
export async function deliverTickets(tickets: T[], to: { email?: string | null; phone?: string | null; name?: string | null }) {
  if (!tickets.length) return;
  const e = eventOf(tickets[0].eventId);
  const title = `Votre billet${tickets.length > 1 ? 's' : ''} : ${e?.t ?? tickets[0].eventId}`;
  const when = e ? `${dateFr(e.date)} · ${e.city}` : '';
  const lines = tickets.map((t) => `• ${t.ticketType} — code ${t.code} — ${verifyUrl(site(), 'billet', t.code)}`).join('\n');
  try {
    if (to.email && !to.email.endsWith('@telephone.cea4africa.com')) {
      const blocks = await Promise.all(tickets.map(async (t) => {
        const png = await QRCode.toDataURL(verifyUrl(site(), 'billet', t.code), { margin: 1, width: 220, color: { dark: '#082B4C', light: '#FFFFFF' } });
        return `<div style="border:1px solid #d9e0e8;border-radius:10px;padding:16px;margin:12px 0;text-align:center"><p style="margin:0 0 6px"><b>${escHtml(t.ticketType)}</b>${t.holderName ? ` — ${escHtml(t.holderName)}` : ''}</p><img src="${png}" width="220" height="220" alt="QR code du billet ${t.code}" /><p style="font-family:monospace;margin:6px 0 0">${t.code}</p></div>`;
      }));
      const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#14202e"><h2 style="color:#082B4C">${escHtml(e?.t ?? '')}</h2><p>${escHtml(when)}</p><p>Bonjour ${escHtml(to.name ?? '')}, présentez ce QR code à l'entrée (sur votre téléphone ou imprimé).</p>${blocks.join('')}<p style="font-size:13px;color:#5b6b7c">Vos billets sont aussi dans « Mon espace › Billets » : ${site()}/espace/billets<br />Transfert possible jusqu'au début de l'événement ; remboursement des billets payants jusqu'à ${REFUND_DAYS} jours avant.</p><p>— CEA FOR AFRICA</p></div>`;
      await sendEmail(to.email, title, `Bonjour ${to.name ?? ''},\n\n${e?.t ?? ''}\n${when}\n\n${lines}\n\nPrésentez le QR code (lien ci-dessus) à l'entrée.\n— CEA FOR AFRICA`, html);
    }
    if (to.phone) await sendWhatsApp(to.phone, `CEA FOR AFRICA — ${title}\n${when}\n${lines}`);
  } catch (err) {
    console.error('[billets] envoi impossible :', err instanceof Error ? err.message : err);
  }
}

/** Coordonnées d'un compte (pour l'envoi des billets). */
export async function contactOf(userId: string) {
  const [u] = await db.select({ email: s.user.email, phone: s.user.phoneNumber, name: s.user.name }).from(s.user).where(eq(s.user.id, userId));
  return u ?? {};
}

/** Une place s'est libérée : prévient la plus ancienne personne de la liste d'attente pas encore prévenue. */
export async function releaseSeat(eventId: string) {
  const [w] = await db.select().from(s.eventWaitlist).where(and(eq(s.eventWaitlist.eventId, eventId), isNull(s.eventWaitlist.notifiedAt))).orderBy(asc(s.eventWaitlist.createdAt)).limit(1);
  if (!w) return;
  await db.update(s.eventWaitlist).set({ notifiedAt: new Date() }).where(eq(s.eventWaitlist.id, w.id));
  const e = eventOf(eventId);
  const url = `${site()}/evenements/${eventId}`;
  try { await sendEmail(w.email, `Une place s'est libérée : ${e?.t ?? eventId}`, `Bonjour,\n\nUne place vient de se libérer pour « ${e?.t ?? eventId} »${e ? ` (${dateFr(e.date)}, ${e.city})` : ''}.\nElle revient à la première personne qui réserve : ${url}\n\n— CEA FOR AFRICA`); }
  catch (err) { console.error('[liste d’attente] envoi impossible :', err instanceof Error ? err.message : err); }
  if (w.userId) await db.insert(s.notification).values({ userId: w.userId, title: `Une place s'est libérée : ${e?.t ?? eventId}`, link: `/evenements/${eventId}` });
}

/** Transfère un billet à une autre personne : nouveau code (l'ancien QR devient invalide). */
export async function transferTicket(t: T, to: { name: string; email: string }) {
  const [rcpt] = await db.select({ id: s.user.id, phone: s.user.phoneNumber }).from(s.user).where(eq(s.user.email, to.email.toLowerCase()));
  const code = newTicketCode(t.eventId);
  const [n] = await db.update(s.eventTicket).set({ code, holderName: to.name, holderEmail: to.email.toLowerCase(), userId: rcpt?.id ?? null })
    .where(and(eq(s.eventTicket.id, t.id), eq(s.eventTicket.status, 'valide'), isNull(s.eventTicket.checkedInAt))).returning();
  if (!n) return null;
  await deliverTickets([n], { email: to.email, phone: rcpt?.phone, name: to.name });
  if (rcpt) await notify(rcpt.id, `Un billet vous a été transféré : ${eventOf(t.eventId)?.t ?? t.eventId}`, '/espace/billets');
  return n;
}

/** Peut-on encore annuler / transférer ce billet ? */
export function rules(t: T) {
  const e = eventOf(t.eventId);
  const d = e ? daysBefore(e.date) : -1;
  const active = t.status === 'valide' && !t.checkedInAt && d >= 0;
  return { canTransfer: active, canCancel: active && (t.priceXof === 0 || d >= REFUND_DAYS), refund: t.priceXof > 0, days: d };
}

/** Annule un billet : gratuit → place libérée ; payant (jusqu'à J-7) → remboursement à effectuer par la finance. */
export async function cancelTicket(t: T, userId: string) {
  const [n] = await db.update(s.eventTicket).set({ status: t.priceXof > 0 ? 'rembourse' : 'annule' })
    .where(and(eq(s.eventTicket.id, t.id), eq(s.eventTicket.status, 'valide'), isNull(s.eventTicket.checkedInAt))).returning();
  if (!n) return null;
  if (t.priceXof > 0) {
    const [pay] = t.paymentId ? await db.select({ ref: s.payment.reference, method: s.payment.method }).from(s.payment).where(eq(s.payment.id, t.paymentId)) : [];
    const [u] = await db.select({ name: s.user.name, email: s.user.email }).from(s.user).where(eq(s.user.id, userId));
    await db.insert(s.contactMessage).values({
      reference: `RMB-${t.code}`, motif: 'Billetterie — remboursement', routedTeam: 'Finance', name: u?.name ?? '—', contact: u?.email ?? '—', userId,
      message: `Remboursement à effectuer : billet ${t.code} (${t.ticketType}, ${eventOf(t.eventId)?.t ?? t.eventId}), ${t.priceXof} FCFA, paiement ${pay?.ref ?? '—'} par ${pay?.method ?? '—'}.`,
    });
  }
  await releaseSeat(t.eventId);
  return n;
}
