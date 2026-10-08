/* Espace Partenaire, côté partenaire : POST { id } → confirme la réception d'un livrable livré (traçabilité de la convention). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { crmDeal, crmOrg, partnerDeliverable } from '../../db/schema/crm';
import { json, fail, requireUser, audit, clientIp } from '../../lib/session';
import { hasOrgAccess } from '../../lib/partners';
import { notify } from '../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Livrable inconnu.');
  const [l] = await db.select({ l: partnerDeliverable, orgId: crmDeal.orgId, owner: crmDeal.ownerId, org: crmOrg.name }).from(partnerDeliverable)
    .innerJoin(crmDeal, eq(crmDeal.id, partnerDeliverable.dealId)).innerJoin(crmOrg, eq(crmOrg.id, crmDeal.orgId)).where(eq(partnerDeliverable.id, p.data.id));
  if (!l || !(await hasOrgAccess(u.id, l.orgId))) return fail('Livrable introuvable.', 404);
  if (l.l.status !== 'livre') return fail('Ce livrable n’est pas encore livré.');
  if (l.l.acknowledgedAt) return json({ ok: true, message: 'Réception déjà confirmée.' });
  await db.update(partnerDeliverable).set({ acknowledgedAt: new Date(), acknowledgedBy: u.id }).where(eq(partnerDeliverable.id, l.l.id));
  await audit(u.id, 'partenaire.livrable.reception', l.l.id, {}, clientIp(request));
  if (l.owner) await notify(l.owner, `${l.org} a confirmé la réception du livrable « ${l.l.title} ».`, `/admin/crm/organisation/${l.orgId}`);
  return json({ ok: true, message: 'Réception confirmée. Merci !' });
};
