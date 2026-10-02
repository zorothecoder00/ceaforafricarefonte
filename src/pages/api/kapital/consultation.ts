/* Durée de consultation d'un document (statistiques de la data room, inspirées de DocSend). POST { viewId, seconds } (navigator.sendBeacon). */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dataRoomView } from '../../../db/schema/kapital';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = locals.user;
  if (!u) return new Response(null, { status: 204 });
  const b = (await request.json().catch(() => null)) as { viewId?: string; seconds?: number } | null;
  const secs = Math.max(0, Math.min(Math.round(Number(b?.seconds) || 0), 4 * 3600));
  if (b?.viewId && /^[0-9a-f-]{36}$/.test(b.viewId)) await db.update(dataRoomView).set({ seconds: secs }).where(and(eq(dataRoomView.id, b.viewId), eq(dataRoomView.investorId, u.id)));
  return new Response(null, { status: 204 });
};
