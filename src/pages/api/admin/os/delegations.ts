/* CEA OS — délégation de signature (prototype : Mon poste › Ma délégation de signature).
   POST { action: 'create', to, until (AAAA-MM-JJ) } · { action: 'revoke', id } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osDelegation } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { staffById } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { dstr } from '../../../../lib/os/ref';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), to: z.string().regex(/^EMP\d{3,6}$/), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date de fin.') }),
  z.object({ action: z.literal('revoke'), id: z.uuid() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  if (b.action === 'revoke') {
    const [d] = await db.update(osDelegation).set({ revoked: true }).where(and(eq(osDelegation.id, b.id), eq(osDelegation.fromStaff, me.id))).returning();
    if (!d) return fail('Délégation introuvable.', 404);
    await audit(me.userId, 'os.delegation.revocation', d.toStaff);
    return json({ ok: true, message: 'Délégation révoquée.' });
  }
  const until = new Date(b.until + 'T23:59:00');
  if (until < new Date()) return fail('La date de fin doit être dans le futur.');
  const to = await staffById(b.to);
  if (!to || !to.active || to.id === me.id) return fail('Délégataire invalide.');
  await db.insert(osDelegation).values({ fromStaff: me.id, toStaff: to.id, until });
  await notifyStaff([to.id], `Délégation reçue de ${me.name} jusqu'au ${dstr(until)}`, '/os/approbations');
  await audit(me.userId, 'os.delegation.creation', to.id, { jusqua: b.until });
  return json({ ok: true, message: 'Délégation active.' });
};
