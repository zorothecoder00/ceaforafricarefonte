/* CEA OS — messagerie interne (prototype › pMessages).
   GET  ?c=<canal>&after=<id>          → nouveaux messages du canal (et marque le canal comme lu)
   POST { action: 'send', channel, body }
   POST { action: 'dm', to }           → ouvre (ou crée) la conversation directe, { redirect } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osChannel, osMessage } from '../../../../db/schema/os';
import { json, fail } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { allStaff, staffById } from '../../../../lib/os/core';
import { chAllowed, dmChannel, markSeen } from '../../../../lib/os/collab';
import { dtstr } from '../../../../lib/os/ref';

export const prerender = false;

async function channelFor(id: string, me: WithMe['me']) {
  const [c] = await db.select().from(osChannel).where(eq(osChannel.id, id));
  return c && chAllowed(c, me) ? c : null;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const ch = await channelFor(url.searchParams.get('c') ?? '', me);
  if (!ch) return fail('Canal introuvable.', 404);
  const after = Number(url.searchParams.get('after')) || 0;
  const rows = await db.select().from(osMessage).where(and(eq(osMessage.channelId, ch.id), gt(osMessage.id, after))).orderBy(asc(osMessage.id)).limit(200);
  if (rows.length) await markSeen(me.id, ch.id);
  const people = rows.length ? await allStaff() : [];
  return json({ ok: true, messages: rows.map((m) => ({ id: m.id, me: m.staffId === me.id, who: people.find((s) => s.id === m.staffId)?.name ?? '—', at: dtstr(m.at), body: m.body })) });
};

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), channel: z.string().min(2).max(80), body: z.string().trim().min(1, 'Message vide.').max(4000) }),
  z.object({ action: z.literal('dm'), to: z.string().regex(/^EMP\d{3,6}$/) }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  if (b.action === 'dm') {
    const other = await staffById(b.to);
    if (!other || other.id === me.id) return fail('Destinataire invalide.');
    const id = await dmChannel(me, other);
    return json({ ok: true, message: 'Conversation ouverte.', redirect: `/os/messagerie?c=${id}` });
  }
  const ch = await channelFor(b.channel, me);
  if (!ch) return fail('Canal introuvable.', 404);
  const [m] = await db.insert(osMessage).values({ channelId: ch.id, staffId: me.id, body: b.body }).returning();
  await markSeen(me.id, ch.id);
  return json({ ok: true, id: m.id });
};
