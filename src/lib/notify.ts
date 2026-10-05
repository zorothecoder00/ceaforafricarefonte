/* Notifications omnicanales (CDC §10) : centre de notifications + push + e-mail + WhatsApp/SMS selon les préférences.
   Le push part pour chaque notification vers les appareils que le membre a autorisés ; e-mail et WhatsApp seulement si l'appelant les demande.
   Préférences (profil.notifPrefs) : canaux activés par catégorie, heures de silence (ni push, ni WhatsApp/SMS pendant ce créneau).
   La catégorie est déduite du lien de la notification. Le centre de notifications reçoit toujours tout.
   Les envois externes échouent silencieusement (journalisés) pour ne jamais bloquer l'action de l'utilisateur. */
import { eq } from 'drizzle-orm';
import { db } from './db';
import { notification, profile } from '../db/schema/app';
import { user } from '../db/schema/auth';
import { sendEmail, sendWhatsApp } from './messaging';
import { sendPush } from './push';

type Channels = { email?: boolean; whatsapp?: boolean };

export const NOTIF_CATEGORIES = {
  evenements: 'Événements et billets',
  candidatures: 'Candidatures, projets, emploi et recrutement',
  apprentissage: 'Apprentissage, certificats et mentorat',
  kapital: 'Kapital Invest (dossiers, investissement)',
  communaute: 'Communauté, messages et vie associative',
  compte: 'Compte, adhésion et paiements',
} as const;
export type NotifCategory = keyof typeof NOTIF_CATEGORIES;
export type NotifChannel = 'push' | 'email' | 'whatsapp';
export type NotifPrefs = { cat?: Partial<Record<NotifCategory, Partial<Record<NotifChannel, boolean>>>>; quiet?: { from: string; to: string; tz: string } | null };

const RULES: [RegExp, NotifCategory][] = [
  [/^\/(espace\/billets|evenements)/, 'evenements'],
  [/^\/(espace\/candidatures|espace\/recruteur|espace\/projets|projets|opportunites|programmes)/, 'candidatures'],
  [/^\/(academie|verifier\/certificat|espace\/apprentissage|espace\/mentor)/, 'apprentissage'],
  [/^\/(kapital|admin\/kapital|admin\/conformite)/, 'kapital'],
  [/^\/(communaute|espace\/messages|voix|actionnariat)/, 'communaute'],
];
export const categoryOf = (link?: string): NotifCategory => RULES.find(([re]) => link && re.test(link))?.[1] ?? 'compte';

/** L'heure courante (dans le fuseau choisi) est-elle dans le créneau de silence ? Gère les créneaux qui passent minuit. */
export function inQuietHours(q: NotifPrefs['quiet'], now = new Date()) {
  if (!q?.from || !q?.to || q.from === q.to) return false;
  let hm: string;
  try { hm = now.toLocaleTimeString('fr-FR', { timeZone: q.tz || 'Africa/Lome', hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { hm = now.toISOString().slice(11, 16); }
  return q.from < q.to ? hm >= q.from && hm < q.to : hm >= q.from || hm < q.to;
}

export async function notify(userId: string, title: string, link?: string, channels: Channels = {}) {
  await db.insert(notification).values({ userId, title, link });
  const [u] = await db.select({ email: user.email, phone: user.phoneNumber, name: user.name, prefs: profile.notifPrefs }).from(user).leftJoin(profile, eq(profile.userId, user.id)).where(eq(user.id, userId));
  if (!u) return;
  const prefs = (u.prefs ?? {}) as NotifPrefs;
  const pc = prefs.cat?.[categoryOf(link)] ?? {};
  const wantEmail = channels.email && pc.email !== false;
  const quiet = inQuietHours(prefs.quiet);
  const wantWa = channels.whatsapp && pc.whatsapp !== false && !quiet;
  if (pc.push !== false && !quiet) await sendPush(userId, { title: 'CEA FOR AFRICA', body: title, url: link }).catch((e) => console.error('[notify] push impossible :', e instanceof Error ? e.message : e));
  if (!wantEmail && !wantWa) return;
  const url = link ? new URL(link, process.env.BETTER_AUTH_URL ?? 'http://localhost:4321').href : '';
  const text = `${title}${url ? `\n\n${url}` : ''}`;
  try {
    if (wantEmail && u.email && !u.email.endsWith('@telephone.cea4africa.com')) await sendEmail(u.email, title, `Bonjour ${u.name},\n\n${text}\n\nGérer mes préférences de notification : ${new URL('/espace/notifications', process.env.BETTER_AUTH_URL ?? 'http://localhost:4321').href}\n— CEA FOR AFRICA`);
    if (wantWa && u.phone) await sendWhatsApp(u.phone, `CEA FOR AFRICA : ${text}`);
  } catch (e) {
    console.error('[notify] envoi externe impossible :', e instanceof Error ? e.message : e);
  }
}
