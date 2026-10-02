/* Notifications omnicanales (CDC §10) : centre de notifications + e-mail + WhatsApp/SMS selon les préférences.
   Les envois externes échouent silencieusement (journalisés) pour ne jamais bloquer l'action de l'utilisateur. */
import { eq } from 'drizzle-orm';
import { db } from './db';
import { notification } from '../db/schema/app';
import { user } from '../db/schema/auth';
import { sendEmail, sendWhatsApp } from './messaging';

type Channels = { email?: boolean; whatsapp?: boolean };

export async function notify(userId: string, title: string, link?: string, channels: Channels = {}) {
  await db.insert(notification).values({ userId, title, link });
  if (!channels.email && !channels.whatsapp) return;
  const [u] = await db.select({ email: user.email, phone: user.phoneNumber, name: user.name }).from(user).where(eq(user.id, userId));
  if (!u) return;
  const url = link ? new URL(link, process.env.BETTER_AUTH_URL ?? 'http://localhost:4321').href : '';
  const text = `${title}${url ? `\n\n${url}` : ''}`;
  try {
    if (channels.email && u.email && !u.email.endsWith('@telephone.cea4africa.com')) await sendEmail(u.email, title, `Bonjour ${u.name},\n\n${text}\n\n— CEA FOR AFRICA`);
    if (channels.whatsapp && u.phone) await sendWhatsApp(u.phone, `CEA FOR AFRICA : ${text}`);
  } catch (e) {
    console.error('[notify] envoi externe impossible :', e instanceof Error ? e.message : e);
  }
}
