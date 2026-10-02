/* Lettre d'information segmentée par intérêts, pays et langue (CDC §6.1). Double confirmation par e-mail. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db } from '../../lib/db';
import { newsletterSubscription } from '../../db/schema/app';
import { json, fail } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';
import { sendEmail } from '../../lib/messaging';
import { requireEnv } from '../../lib/env';

export const prerender = false;

export const sign = (email: string) => createHmac('sha256', requireEnv('BETTER_AUTH_SECRET')).update('nl:' + email).digest('base64url').slice(0, 24);

const Body = z.object({
  email: z.email().trim().toLowerCase(),
  topics: z.array(z.string().max(40)).max(10).default([]),
  country: z.string().max(60).optional(),
  lang: z.enum(['fr', 'en']).default('fr'),
});

export const POST: APIRoute = async ({ request, url }) => {
  const limited = rateLimit(request, 'newsletter', 5);
  if (limited) return limited;
  const raw = await readJson(request);
  if (isBot(raw)) return json({ ok: true });
  const p = Body.safeParse(raw);
  if (!p.success) return fail(raw?.lang === 'en' ? 'Enter a valid email address.' : 'Saisissez une adresse e-mail valide.');
  const { email, topics, country, lang } = p.data;
  await db.insert(newsletterSubscription).values({ email, topics, country, lang })
    .onConflictDoUpdate({ target: newsletterSubscription.email, set: { topics, country, lang, unsubscribedAt: null } });
  const token = sign(email);
  const confirm = new URL(`/api/newsletter?confirmer=${encodeURIComponent(email)}&t=${token}`, url.origin).href;
  await sendEmail(email, lang === 'en' ? 'Confirm your subscription' : 'Confirmez votre inscription', (lang === 'en' ? 'Confirm your subscription to the CEA FOR AFRICA newsletter:\n' : "Confirmez votre inscription à la lettre d'information de CEA FOR AFRICA :\n") + confirm).catch(() => {});
  return json({ ok: true, message: lang === 'en' ? 'Almost done: check your inbox to confirm.' : 'Presque fini : confirmez depuis l’e-mail que nous venons d’envoyer.' });
};

/* Lien de confirmation ou de désinscription (?confirmer=… ou ?desinscrire=…) */
export const GET: APIRoute = async ({ url, redirect }) => {
  const email = url.searchParams.get('confirmer') ?? url.searchParams.get('desinscrire');
  if (!email || url.searchParams.get('t') !== sign(email)) return new Response('Lien invalide.', { status: 400 });
  if (url.searchParams.has('confirmer')) await db.update(newsletterSubscription).set({ confirmedAt: new Date() }).where(eq(newsletterSubscription.email, email));
  else await db.update(newsletterSubscription).set({ unsubscribedAt: new Date() }).where(eq(newsletterSubscription.email, email));
  return redirect(url.searchParams.has('confirmer') ? '/?lettre=confirmee' : '/?lettre=desinscrit');
};
