/* Campagnes (CDC §12) : tâche planifiée (Vercel Cron, voir vercel.json).
   Lance les campagnes programmées arrivées à leur date et poursuit les envois interrompus, par lots, dans la limite de 50 secondes. */
import type { APIRoute } from 'astro';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { campaign } from '../../../db/schema/crm';
import { prepare, processBatch } from '../../../lib/campaigns';
import { cronAuthorized } from '../../../lib/cron';
import { json, fail, audit } from '../../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!cronAuthorized(request.headers.get('authorization'))) return fail('Accès refusé.', 401);
  const deadline = Date.now() + 50_000;
  const due = await db.select().from(campaign).where(and(eq(campaign.status, 'programmee'), lte(campaign.scheduledAt, new Date())));
  for (const c of due) {
    const n = await prepare(c);
    await audit(c.approvedBy, 'campagne.envoi.programme', c.id, { recipients: n });
    if (!n) await db.update(campaign).set({ status: 'envoyee', sentAt: new Date() }).where(eq(campaign.id, c.id));
  }
  let sent = 0, failed = 0;
  const running = await db.select({ id: campaign.id }).from(campaign).where(inArray(campaign.status, ['envoi']));
  for (const { id } of running) {
    while (Date.now() < deadline) {
      const r = await processBatch(id);
      sent += r.sent; failed += r.failed;
      if (r.done || (!r.sent && !r.failed)) break;
    }
  }
  return json({ ok: true, started: due.length, sent, failed });
};
