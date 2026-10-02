/* Envois sortants : codes SMS/WhatsApp et e-mails transactionnels (CDC §10, §13.2).
   Les prestataires s'activent par variables d'environnement :
   - E-mail   : RESEND_API_KEY (+ EMAIL_FROM)
   - SMS      : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
   - WhatsApp : WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (WhatsApp Business Platform / Cloud API, modèle « code »)
   Sans prestataire : en développement le contenu est affiché dans la console ; en production l'envoi échoue explicitement. */
import { env, isProd } from './env';

const devLog = (channel: string, to: string, text: string) => console.info(`[CEA][dev][${channel}] → ${to}\n${text}`);

export async function sendEmail(to: string, subject: string, text: string) {
  const key = env('RESEND_API_KEY');
  if (!key) {
    if (isProd()) throw new Error("Aucun prestataire e-mail n'est configuré (RESEND_API_KEY).");
    return devLog('e-mail', to, `${subject}\n\n${text}`);
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM') ?? 'CEA FOR AFRICA <noreply@cea4africa.com>', to, subject, text }),
  });
  if (!res.ok) throw new Error(`Envoi e-mail refusé (${res.status})`);
}

export async function sendSms(to: string, text: string) {
  const sid = env('TWILIO_ACCOUNT_SID'), token = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM');
  if (!sid || !token || !from) {
    if (isProd()) throw new Error("Aucun prestataire SMS n'est configuré (TWILIO_*).");
    return devLog('sms', to, text);
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: text }),
  });
  if (!res.ok) throw new Error(`Envoi SMS refusé (${res.status})`);
}

export async function sendWhatsApp(to: string, text: string) {
  const token = env('WHATSAPP_TOKEN'), phoneId = env('WHATSAPP_PHONE_ID');
  if (!token || !phoneId) return sendSms(to, text); // repli sur le SMS
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body: text } }),
  });
  if (!res.ok) throw new Error(`Envoi WhatsApp refusé (${res.status})`);
}

export async function sendOtp(phoneNumber: string, code: string, purpose: 'connexion' | 'reinitialisation' = 'connexion') {
  const text = purpose === 'connexion'
    ? `CEA FOR AFRICA : votre code de connexion est ${code}. Il expire dans 5 minutes. Ne le communiquez à personne.`
    : `CEA FOR AFRICA : votre code de réinitialisation est ${code}. Il expire dans 5 minutes.`;
  // WhatsApp en priorité (CDC §5.4), repli SMS
  return sendWhatsApp(phoneNumber, text);
}
