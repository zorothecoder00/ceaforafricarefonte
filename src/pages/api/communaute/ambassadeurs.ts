/* Ambassadeurs pays (CDC §7.8) : nommés par l'équipe (droit M sur « membres »), parmi les contributeurs les plus actifs.
   POST { userId, country } → nomme ; DELETE { userId, country } → met fin à la mission. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { countryAmbassador } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { notify } from '../../../lib/notify';
import { country } from '../../../data/site';

export const prerender = false;
const Body = z.object({ userId: z.string().min(1).max(64), country: z.string().length(2) });

export const POST: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'membres', 'M');
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [who] = await db.select({ name: user.name }).from(user).where(eq(user.id, p.data.userId));
  if (!who) return fail('Membre introuvable.', 404);
  await db.insert(countryAmbassador).values({ userId: p.data.userId, country: p.data.country, appointedBy: u.id })
    .onConflictDoUpdate({ target: [countryAmbassador.userId, countryAmbassador.country], set: { endedAt: null, since: new Date(), appointedBy: u.id } });
  await audit(u.id, 'communaute.ambassadeur.nomination', p.data.userId, { pays: p.data.country }, clientIp(request));
  await notify(p.data.userId, `Félicitations : vous êtes nommé·e ambassadeur·rice CEA FOR AFRICA (${country(p.data.country)}). L'équipe vous contactera pour la suite.`, '/communaute/classement', { email: true });
  return json({ ok: true, message: `${who.name} est ambassadeur·rice (${country(p.data.country)}).` });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'membres', 'M');
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  await db.update(countryAmbassador).set({ endedAt: new Date() }).where(and(eq(countryAmbassador.userId, p.data.userId), eq(countryAmbassador.country, p.data.country), isNull(countryAmbassador.endedAt)));
  await audit(u.id, 'communaute.ambassadeur.fin', p.data.userId, { pays: p.data.country }, clientIp(request));
  return json({ ok: true, message: 'Mission d’ambassadeur·rice terminée.' });
};
