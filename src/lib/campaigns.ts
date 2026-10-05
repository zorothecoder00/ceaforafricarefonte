/* Campagnes (CDC §12) : e-mail, SMS, WhatsApp et push segmentés, test A/B, statistiques.
   - Préparation : le segment est évalué, seuls les destinataires éligibles (consentement marketing, ou relation existante pour un
     message de service) reçoivent une ligne campaign_send ; la variante A/B est tirée au sort selon la part choisie.
   - Envoi par lots (reprenable : les lignes déjà envoyées ne repartent pas).
   - Suivi : pixel d'ouverture et liens suivis (e-mail), désabonnement en un clic sur chaque message marketing.
     Les liens suivis désignent un numéro de lien du message, jamais une adresse : pas de redirection ouverte. */
import { createHmac } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { campaign, campaignSend, crmSegment, crmContact } from '../db/schema/crm';
import { consent, newsletterSubscription } from '../db/schema/app';
import { evaluate, eligible, Rules, type Recipient } from './segments';
import { sendEmail, sendSms, sendWhatsApp } from './messaging';
import { sendPush } from './push';
import { env } from './env';

type Campaign = typeof campaign.$inferSelect;
type Send = typeof campaignSend.$inferSelect;

export const siteUrl = () => (env('BETTER_AUTH_URL') ?? env('PUBLIC_SITE_URL') ?? 'http://localhost:4321').replace(/\/$/, '');
const secret = () => env('BETTER_AUTH_SECRET') ?? 'dev-secret';
/** Jeton de suivi d'un envoi (signature : on ne peut pas fabriquer un lien pour un autre destinataire). */
export const sendToken = (sendId: string) => createHmac('sha256', secret()).update(`campagne:${sendId}`).digest('base64url').slice(0, 22);
export const validToken = (sendId: string, t: string) => t.length === 22 && sendToken(sendId) === t;

/* ----- Contenu ----- */
export const variantOf = (c: Campaign, v: string) => (v === 'B' && c.splitB > 0 ? { subject: c.subjectB || c.subject || '', body: c.bodyB || c.body } : { subject: c.subject ?? '', body: c.body });
const URL_RE = /https?:\/\/[^\s<>"')]+/g;
/** Adresse sans la ponctuation qui la suit dans la phrase (« voir https://x.org. » → https://x.org). */
const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, '');
/** Liens du message, dans l'ordre (index utilisé par le lien suivi). */
export const linksOf = (body: string) => [...new Set((body.match(URL_RE) ?? []).map(trimUrl))];
/** Variables : {prenom}, {nom}. Sans nom connu (abonné à la lettre), « Bonjour {prenom}, » devient « Bonjour, ». */
export function personalize(text: string, r: { name?: string | null }) {
  const first = (r.name ?? '').trim().split(/\s+/)[0] ?? '';
  return text.replace(/\{prenom\}/g, first).replace(/\{nom\}/g, (r.name ?? '').trim())
    .replace(/Bonjour ,/g, 'Bonjour,').replace(/Hello ,/g, 'Hello,');
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const unsubUrl = (s: Send) => `${siteUrl()}/desabonnement?s=${s.id}&t=${sendToken(s.id)}`;

/** E-mail HTML : paragraphes, liens suivis, pixel d'ouverture, pied de page avec désabonnement (marketing). */
export function emailHtml(c: Campaign, s: Send, body: string) {
  const links = linksOf(body);
  const t = sendToken(s.id);
  const html = esc(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.5">${p.replace(/\n/g, '<br>')}</p>`).join('')
    .replace(/https?:\/\/[^\s<>"']+/g, (m) => {
      const u = trimUrl(m), rest = m.slice(u.length);
      const i = links.indexOf(u.replace(/&amp;/g, '&'));
      return i < 0 ? m : `<a href="${siteUrl()}/api/c/clic?s=${s.id}&amp;l=${i}&amp;t=${t}" style="color:#0B5CAD">${u}</a>${rest}`;
    });
  const foot = c.purpose === 'marketing'
    ? `Vous recevez ce message car vous avez accepté les communications de CEA FOR AFRICA. <a href="${unsubUrl(s)}" style="color:#5b6b7c">Se désabonner</a>`
    : 'Message de service lié à votre inscription sur CEA FOR AFRICA.';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#14202e;font-size:15px"><div style="background:#082B4C;color:#fff;padding:14px 18px;font-weight:bold">CEA FOR AFRICA</div><div style="padding:20px 18px">${html}</div><div style="padding:10px 18px;font-size:12px;color:#5b6b7c;border-top:1px solid #e3e8ee">${foot}</div><img src="${siteUrl()}/api/c/ouverture?s=${s.id}&amp;t=${t}" width="1" height="1" alt="" style="display:block" /></div>`;
}

/* ----- Préparation et envoi ----- */
export async function audience(c: Pick<Campaign, 'segmentId' | 'channel' | 'purpose'>): Promise<Recipient[]> {
  if (!c.segmentId) return [];
  const [seg] = await db.select().from(crmSegment).where(eq(crmSegment.id, c.segmentId));
  if (!seg) return [];
  return (await evaluate(Rules.parse(seg.rules))).filter((r) => eligible(r, c.channel, c.purpose as 'marketing' | 'service'));
}

/** Crée les lignes d'envoi (une par destinataire éligible) ; sans effet sur celles qui existent déjà. */
export async function prepare(c: Campaign) {
  const list = await audience(c);
  const rows = list.map((r) => ({
    campaignId: c.id, recipientKey: r.key, name: r.name || null,
    address: c.channel === 'email' ? r.email : c.channel === 'push' ? r.userId : r.phone,
    variant: c.splitB > 0 && Math.random() * 100 < c.splitB ? 'B' : 'A',
  }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(campaignSend).values(rows.slice(i, i + 500)).onConflictDoNothing();
  await db.update(campaign).set({ status: 'envoi', startedAt: c.startedAt ?? new Date(), updatedAt: new Date() }).where(eq(campaign.id, c.id));
  return rows.length;
}

async function deliver(c: Campaign, s: Send) {
  const { subject, body: raw } = variantOf(c, s.variant);
  const body = personalize(raw, { name: s.name });
  const stop = c.purpose === 'marketing' ? `\nSe désabonner : ${unsubUrl(s)}` : '';
  switch (c.channel) {
    case 'email': return sendEmail(s.address!, personalize(subject, { name: s.name }), `${body}\n\n${c.purpose === 'marketing' ? `Se désabonner : ${unsubUrl(s)}` : ''}`, emailHtml(c, s, body));
    case 'sms': return sendSms(s.address!, `${body}${c.url ? ` ${c.url}` : ''}${stop}`);
    case 'whatsapp': return sendWhatsApp(s.address!, `${body}${c.url ? `\n${c.url}` : ''}${stop}`);
    case 'push': { const n = await sendPush(s.address!, { title: subject || 'CEA FOR AFRICA', body, url: c.url || '/', tag: `campagne-${c.id}` }); if (!n) throw new Error('Aucun appareil joignable'); }
  }
}

/** Envoie un lot ; renvoie l'avancement. La campagne passe à « envoyée » quand il ne reste rien. */
export async function processBatch(campaignId: string, max = 40) {
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  if (!c || c.status !== 'envoi') return { done: true, sent: 0, failed: 0, left: 0 };
  const batch = await db.select().from(campaignSend).where(and(eq(campaignSend.campaignId, campaignId), eq(campaignSend.status, 'en_attente'))).limit(max);
  let sent = 0, failed = 0;
  for (const s of batch) {
    try {
      await deliver(c, s);
      await db.update(campaignSend).set({ status: 'envoye', sentAt: new Date(), error: null }).where(eq(campaignSend.id, s.id));
      sent++;
    } catch (e) {
      await db.update(campaignSend).set({ status: 'echec', error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).where(eq(campaignSend.id, s.id));
      failed++;
    }
  }
  const [{ left }] = await db.select({ left: sql<number>`count(*)::int` }).from(campaignSend).where(and(eq(campaignSend.campaignId, campaignId), eq(campaignSend.status, 'en_attente')));
  if (!left) await db.update(campaign).set({ status: 'envoyee', sentAt: new Date(), updatedAt: new Date() }).where(eq(campaign.id, campaignId));
  return { done: !left, sent, failed, left };
}

/** Statistiques par variante. */
export async function stats(campaignId: string) {
  const rows = await db.select({
    variant: campaignSend.variant,
    total: sql<number>`count(*)::int`,
    sent: sql<number>`count(*) filter (where ${campaignSend.status} = 'envoye')::int`,
    failed: sql<number>`count(*) filter (where ${campaignSend.status} = 'echec')::int`,
    pending: sql<number>`count(*) filter (where ${campaignSend.status} = 'en_attente')::int`,
    opened: sql<number>`count(${campaignSend.openedAt})::int`,
    clicked: sql<number>`count(${campaignSend.clickedAt})::int`,
    unsub: sql<number>`count(${campaignSend.unsubscribedAt})::int`,
  }).from(campaignSend).where(eq(campaignSend.campaignId, campaignId)).groupBy(campaignSend.variant).orderBy(campaignSend.variant);
  return rows;
}

/* ----- Désabonnement ----- */
/** Retire le consentement marketing du destinataire d'un envoi (membre, contact ou abonné à la lettre). */
export async function unsubscribe(s: Send) {
  const [kind, id] = [s.recipientKey.slice(0, 1), s.recipientKey.slice(2)];
  if (kind === 'u') await db.insert(consent).values({ userId: id, kind: 'marketing', granted: false });
  if (kind === 'c') await db.update(crmContact).set({ marketingConsent: false, consentBasis: 'Désabonnement depuis une campagne', consentAt: new Date(), updatedAt: new Date() }).where(eq(crmContact.id, id));
  if (kind === 'n') await db.update(newsletterSubscription).set({ unsubscribedAt: new Date() }).where(eq(newsletterSubscription.id, id));
  await db.update(campaignSend).set({ unsubscribedAt: new Date() }).where(eq(campaignSend.id, s.id));
}
