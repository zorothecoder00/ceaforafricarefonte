/* Simulation de paiement — DÉVELOPPEMENT UNIQUEMENT (désactivée en production et dès qu'un vrai prestataire est configuré). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { payment } from '../../../db/schema/app';
import { json, fail, requireUser } from '../../../lib/session';
import { provider, settle } from '../../../lib/payments';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  if (provider() !== 'simulation') return fail('Simulation indisponible.', 404);
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ ref: z.string(), issue: z.enum(['reussi', 'echoue']), method: z.string().max(30).default('orange_money') }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [pay] = await db.select().from(payment).where(and(eq(payment.reference, p.data.ref), eq(payment.userId, u.id)));
  if (!pay || pay.provider !== 'simulation') return fail('Paiement introuvable.', 404);
  if (p.data.issue === 'reussi') await settle(pay.reference, { method: p.data.method, providerRef: 'SIM-' + Date.now() });
  else await db.update(payment).set({ status: 'echoue' }).where(eq(payment.reference, pay.reference));
  return json({ ok: true, redirect: `/paiement/retour?ref=${pay.reference}` });
};
