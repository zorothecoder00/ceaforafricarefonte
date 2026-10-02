/* Messagerie (CDC §7.8, §10).
   GET  ?conversation=<id>        → messages (membre de la conversation uniquement)
   POST { to: userId, body }       → ouvre (ou reprend) une conversation directe et envoie le message
   POST { conversation, body }     → répond dans une conversation existante */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db';
import { conversation, conversationMember, message, userBlock } from '../../db/schema/app';
import { user } from '../../db/schema/auth';
import { json, fail, requireUser } from '../../lib/session';
import { notify } from '../../lib/notify';
import { rateLimit } from '../../lib/guard';

export const prerender = false;

async function isMember(conversationId: string, userId: string) {
  return (await db.select().from(conversationMember).where(and(eq(conversationMember.conversationId, conversationId), eq(conversationMember.userId, userId)))).length > 0;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const id = url.searchParams.get('conversation') ?? '';
  if (!(await isMember(id, u.id))) return fail('Conversation introuvable.', 404);
  const rows = await db.select({ id: message.id, body: message.body, at: message.createdAt, senderId: message.senderId, sender: user.name }).from(message).innerJoin(user, eq(user.id, message.senderId)).where(eq(message.conversationId, id)).orderBy(asc(message.createdAt)).limit(500);
  await db.update(conversationMember).set({ lastReadAt: new Date() }).where(and(eq(conversationMember.conversationId, id), eq(conversationMember.userId, u.id)));
  return json({ ok: true, me: u.id, messages: rows });
};

const Body = z.object({ to: z.string().optional(), conversation: z.uuid().optional(), body: z.string().trim().min(1).max(4000) });

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'message:' + u.id, 60, 300);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success || (!p.data.to && !p.data.conversation)) return fail('Message vide ou destinataire manquant.');
  let convId = p.data.conversation;
  let recipients: string[] = [];
  if (p.data.to) {
    if (p.data.to === u.id) return fail('Vous ne pouvez pas vous écrire à vous-même.');
    const [dest] = await db.select({ id: user.id }).from(user).where(eq(user.id, p.data.to));
    if (!dest) return fail('Destinataire introuvable.', 404);
    const blocked = await db.select().from(userBlock).where(or(and(eq(userBlock.blockerId, dest.id), eq(userBlock.blockedId, u.id)), and(eq(userBlock.blockerId, u.id), eq(userBlock.blockedId, dest.id))));
    if (blocked.length) return fail('Impossible d’écrire à ce membre.', 403);
    // Conversation directe existante entre les deux membres ?
    const [existing] = await db.select({ id: conversationMember.conversationId }).from(conversationMember)
      .innerJoin(conversation, eq(conversation.id, conversationMember.conversationId))
      .where(and(eq(conversation.isGroup, false), inArray(conversationMember.userId, [u.id, dest.id])))
      .groupBy(conversationMember.conversationId).having(sql`count(*) = 2`);
    if (existing) convId = existing.id;
    else {
      const [c] = await db.insert(conversation).values({}).returning();
      await db.insert(conversationMember).values([{ conversationId: c.id, userId: u.id }, { conversationId: c.id, userId: dest.id }]);
      convId = c.id;
    }
  } else if (!(await isMember(convId!, u.id))) return fail('Conversation introuvable.', 404);
  await db.insert(message).values({ conversationId: convId!, senderId: u.id, body: p.data.body });
  recipients = (await db.select({ id: conversationMember.userId }).from(conversationMember).where(eq(conversationMember.conversationId, convId!))).map((r) => r.id).filter((id) => id !== u.id);
  for (const r of recipients) await notify(r, `Nouveau message de ${u.name}`, `/espace/messages?c=${convId}`);
  return json({ ok: true, conversation: convId, redirect: p.data.to ? `/espace/messages?c=${convId}` : undefined });
};
