/* Centre de notifications : POST { ids?: string[] } marque comme lues (toutes si ids absent) ; PUT enregistre les préférences. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../lib/db';
import { notification, profile } from '../../db/schema/app';
import { NOTIF_CATEGORIES, type NotifCategory } from '../../lib/notify';
import { json, fail, requireUser } from '../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ ids: z.array(z.uuid()).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!p.success) return fail('Données invalides.');
  const where = and(eq(notification.userId, u.id), isNull(notification.readAt), p.data.ids?.length ? inArray(notification.id, p.data.ids) : undefined);
  await db.update(notification).set({ readAt: new Date() }).where(where);
  return json({ ok: true, message: 'Notifications marquées comme lues.' });
};

/* Préférences : PUT { cat: { <catégorie>: { email, whatsapp } }, quiet: { from: 'HH:MM', to: 'HH:MM', tz } | null } */
const HM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Chan = z.object({ email: z.boolean(), whatsapp: z.boolean(), push: z.boolean().optional() });
const Prefs = z.object({
  cat: z.object(Object.fromEntries(Object.keys(NOTIF_CATEGORIES).map((k) => [k, Chan.optional()])) as Record<NotifCategory, z.ZodOptional<typeof Chan>>),
  quiet: z.object({ from: HM, to: HM, tz: z.string().max(60) }).nullable(),
});

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Prefs.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Préférences invalides.');
  if (p.data.quiet) { try { new Intl.DateTimeFormat('fr-FR', { timeZone: p.data.quiet.tz }); } catch { return fail('Fuseau horaire inconnu.'); } }
  await db.insert(profile).values({ userId: u.id, notifPrefs: p.data }).onConflictDoUpdate({ target: profile.userId, set: { notifPrefs: p.data, updatedAt: new Date() } });
  return json({ ok: true, message: 'Préférences de notification enregistrées.' });
};
