/* Statut d'un paiement de l'utilisateur (page de retour). Revérifie auprès de CinetPay si le paiement est encore en attente. */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { payment } from '../../../db/schema/app';
import { json, fail, requireUser } from '../../../lib/session';
import { checkCinetpay, settle } from '../../../lib/payments';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const ref = url.searchParams.get('ref') ?? '';
  let [pay] = await db.select().from(payment).where(and(eq(payment.reference, ref), eq(payment.userId, u.id)));
  if (!pay) return fail('Paiement introuvable.', 404);
  if (pay.status === 'en_attente' && pay.provider === 'cinetpay') {
    const st = await checkCinetpay(ref);
    if (st.status === 'reussi' && st.amount === pay.amountXof) pay = (await settle(ref, { method: st.method, providerRef: st.providerRef })) ?? pay;
    else if (st.status === 'echoue') [pay] = await db.update(payment).set({ status: 'echoue' }).where(eq(payment.reference, ref)).returning();
  }
  return json({ ok: true, status: pay.status, purpose: pay.purpose, label: (pay.metadata as { label?: string }).label, amount: pay.amountXof });
};
