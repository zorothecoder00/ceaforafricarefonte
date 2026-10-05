/* Pixel d'ouverture des e-mails de campagne (CDC §12, statistiques). GET ?s=<envoi>&t=<jeton> → image 1×1, première ouverture enregistrée. */
import type { APIRoute } from 'astro';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { campaignSend } from '../../../db/schema/crm';
import { validToken } from '../../../lib/campaigns';

export const prerender = false;
const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));

export const GET: APIRoute = async ({ url }) => {
  const s = url.searchParams.get('s') ?? '', t = url.searchParams.get('t') ?? '';
  if (/^[0-9a-f-]{36}$/.test(s) && validToken(s, t)) {
    await db.update(campaignSend).set({ openedAt: new Date() }).where(and(eq(campaignSend.id, s), isNull(campaignSend.openedAt))).catch(() => {});
  }
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } });
};
