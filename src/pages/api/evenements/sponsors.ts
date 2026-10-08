/* Accès « stand » des sponsors d'un événement (CDC §7.3), géré par l'équipe (droit V sur controle_acces).
   POST   { eventId, sponsorName, email } → ouvre l'accès au représentant du sponsor (compte membre existant), qui est notifié
   DELETE { id }                          → ferme l'accès ; les contacts déjà collectés restent soumis à l'accord des participants */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { eventSponsorAccess } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { findEvent } from '../../../lib/catalog';
import { notify } from '../../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'controle_acces', 'V');
  if (u instanceof Response) return u;
  const p = z.object({ eventId: z.string().min(1).max(40), sponsorName: z.string().trim().min(2).max(120), email: z.email() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Indiquez le sponsor et l’e-mail de son représentant.');
  const e = await findEvent(p.data.eventId, { hidden: true });
  if (!e) return fail('Événement inconnu.', 404);
  const [rep] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(sql`lower(${user.email})`, p.data.email.toLowerCase()));
  if (!rep) return fail('Aucun compte avec cet e-mail : le représentant du sponsor doit d’abord créer un compte membre.', 404);
  await db.insert(eventSponsorAccess).values({ eventId: e.id, sponsorName: p.data.sponsorName, userId: rep.id, createdBy: u.id })
    .onConflictDoUpdate({ target: [eventSponsorAccess.eventId, eventSponsorAccess.userId], set: { sponsorName: p.data.sponsorName, revokedAt: null } });
  await audit(u.id, 'evenement.sponsor.acces', e.id, { sponsor: p.data.sponsorName, representant: rep.id }, clientIp(request));
  await notify(rep.id, `Accès stand ouvert pour ${p.data.sponsorName} à « ${e.t} » : scannez les badges des participants qui acceptent de partager leurs coordonnées.`, `/evenements/${e.id}/stand`, { email: true });
  return json({ ok: true, message: `Accès ouvert à ${rep.name} pour ${p.data.sponsorName}.` });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'controle_acces', 'V');
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Accès inconnu.');
  const [a] = await db.update(eventSponsorAccess).set({ revokedAt: new Date() }).where(eq(eventSponsorAccess.id, p.data.id)).returning();
  if (!a) return fail('Accès inconnu.', 404);
  await audit(u.id, 'evenement.sponsor.fermeture', a.eventId, { sponsor: a.sponsorName }, clientIp(request));
  return json({ ok: true, message: 'Accès stand fermé.' });
};
