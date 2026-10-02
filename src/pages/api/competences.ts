/* Répondre à un appel à compétences d'un projet (CDC §7.2). POST { callId, message } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { skillCall, skillCallResponse, project } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';
import { notify } from '../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ callId: z.uuid(), message: z.string().trim().min(10).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Présentez-vous en quelques mots (10 caractères minimum).');
  const [c] = await db.select({ need: skillCall.need, open: skillCall.open, owner: project.ownerId, name: project.name }).from(skillCall).innerJoin(project, eq(project.id, skillCall.projectId)).where(eq(skillCall.id, p.data.callId));
  if (!c || !c.open) return fail('Cet appel est clos.', 404);
  if (c.owner === u.id) return fail('C’est votre propre projet.');
  await db.insert(skillCallResponse).values({ callId: p.data.callId, userId: u.id, message: p.data.message }).onConflictDoUpdate({ target: [skillCallResponse.callId, skillCallResponse.userId], set: { message: p.data.message } });
  await notify(c.owner, `${u.name} répond à votre appel « ${c.need} » (${c.name})`, '/espace/messages');
  return json({ ok: true, message: 'Réponse envoyée au porteur du projet.' });
};
