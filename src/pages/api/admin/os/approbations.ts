/* CEA OS — décisions sur les demandes en attente (prototype : Approbations).
   POST { action: 'decide', id, ok: true|false, com? }  → rejet : motif obligatoire
   POST { action: 'all' }                                → approuve tout ce qui attend l'appelant */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { decide, pendingFor } from '../../../../lib/os/approvals';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('decide'), id: z.string().min(3).max(40), ok: z.preprocess((v) => (v === 'false' ? false : v === 'true' ? true : v), z.boolean()), com: z.string().trim().max(1000).optional().default('') }),
  z.object({ action: z.literal('all') }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  if (b.action === 'decide') {
    const err = await decide(b.id, me, b.ok, b.com);
    if (err) return fail(err);
    return json({ ok: true, message: b.ok ? 'Approuvé. Le demandeur et l’étape suivante sont notifiés.' : 'Rejet notifié au demandeur.' });
  }
  const list = await pendingFor(me.id);
  let n = 0;
  for (const it of list) if (!(await decide(it.r.id, me, true))) n++;
  return json({ ok: true, message: `${n} élément(s) approuvé(s).` });
};
