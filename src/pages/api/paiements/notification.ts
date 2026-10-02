/* Notification de paiement de CinetPay (webhook). Le statut est toujours revérifié auprès de CinetPay avant validation. */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { payment } from '../../../db/schema/app';
import { checkCinetpay, settle } from '../../../lib/payments';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const ref = String(form?.get('cpm_trans_id') ?? '');
  if (!ref) return new Response('ok');
  const [pay] = await db.select().from(payment).where(eq(payment.reference, ref));
  if (!pay || pay.provider !== 'cinetpay' || pay.status !== 'en_attente') return new Response('ok');
  const st = await checkCinetpay(ref);
  if (st.status === 'reussi' && st.amount === pay.amountXof) await settle(ref, { method: st.method, providerRef: st.providerRef });
  else if (st.status === 'echoue') await db.update(payment).set({ status: 'echoue' }).where(eq(payment.reference, ref));
  return new Response('ok');
};

// CinetPay teste parfois l'URL en GET
export const GET: APIRoute = () => new Response('ok');
