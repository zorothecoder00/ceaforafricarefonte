/* Adhésion : formule gratuite activée directement ; formules payantes → paiement (redirection). POST { plan } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { membership, profile } from '../../db/schema/app';
import { json, fail, requireUser, audit } from '../../lib/session';
import { PLANS } from '../../lib/payments';
import { notify } from '../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ plan: z.enum(['gratuit', 'membre', 'premium', 'entreprise']) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Formule inconnue.');
  if (p.data.plan !== 'gratuit') return json({ ok: true, redirect: `/paiement?objet=adhesion&ref=${p.data.plan}`, message: `Paiement : ${PLANS[p.data.plan].label}` });
  const [active] = await db.select().from(membership).where(and(eq(membership.userId, u.id), eq(membership.status, 'active')));
  if (active) return json({ ok: true, message: `Vous avez déjà une adhésion ${active.plan} active.`, redirect: '/espace/carte' });
  const [prof] = await db.select({ country: profile.country }).from(profile).where(eq(profile.userId, u.id));
  const number = `CEA-${prof?.country ?? 'AF'}-${Math.floor(100000 + Math.random() * 900000)}`;
  await db.insert(membership).values({ userId: u.id, plan: 'gratuit', cardNumber: number });
  await audit(u.id, 'adhesion.gratuite', number);
  await notify(u.id, `Bienvenue ! Carte de membre n° ${number}`, '/espace/carte');
  return json({ ok: true, message: 'Adhésion gratuite activée.', redirect: '/espace/carte' });
};
