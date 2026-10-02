/* Vote électronique en assemblée générale (CDC §7.1, RÉG) : authentification forte par code à usage unique et journal de preuve.
   GET                                   → état : ouvert ?, éligible ?, déjà voté (preuve) ?
   POST { action: 'code' }               → envoie un code à 6 chiffres (WhatsApp/SMS si le téléphone est vérifié, sinon e-mail), valable 10 min
   POST { action: 'voter', choices, code } → vérifie le code et enregistre le bulletin (définitif), renvoie l'empreinte de preuve
   Éligibilité : adhésion active. Ouverture : interrupteur réglementaire « vote » du pays du votant. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from '../../lib/db';
import { agBallot, membership, profile } from '../../db/schema/app';
import { user as userT, verification } from '../../db/schema/auth';
import { json, fail, requireUser, audit, clientIp } from '../../lib/session';
import { rateLimit } from '../../lib/guard';
import { isOpen } from '../../lib/kapital';
import { notify } from '../../lib/notify';
import { sendEmail, sendWhatsApp } from '../../lib/messaging';
import { AG, AG_CHOICES } from '../../data/assemblee';

export const prerender = false;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ident = (uid: string) => `ag-vote:${AG.id}:${uid}`;

async function state(uid: string) {
  const [pr] = await db.select({ c: profile.country }).from(profile).where(eq(profile.userId, uid));
  const country = pr?.c ?? 'TG';
  const open = (await isOpen('vote', country)) && new Date() < new Date(AG.closesAt);
  const [m] = await db.select({ id: membership.id }).from(membership)
    .where(and(eq(membership.userId, uid), eq(membership.status, 'active'), or(isNull(membership.endsAt), gt(membership.endsAt, new Date())))).limit(1);
  const [b] = await db.select({ proof: agBallot.proof, at: agBallot.createdAt }).from(agBallot).where(and(eq(agBallot.assembly, AG.id), eq(agBallot.userId, uid)));
  return { open, eligible: !!m, voted: b ?? null, country };
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ ok: true, logged: false });
  const s = await state(locals.user.id);
  return json({ ok: true, logged: true, open: s.open, eligible: s.eligible, voted: s.voted });
};

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('code') }),
  z.object({ action: z.literal('voter'), choices: z.array(z.enum(AG_CHOICES)).length(AG.resolutions.length), code: z.string().regex(/^\d{6}$/) }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Votez sur chaque résolution et saisissez le code à 6 chiffres.');
  const s = await state(u.id);
  if (!s.open) return fail("Le vote électronique n'est pas ouvert pour votre pays : il le sera après validation juridique. Vous pouvez voter en séance ou donner procuration.", 403);
  if (!s.eligible) return json({ ok: false, error: 'Le vote est réservé aux membres à jour de leur adhésion.', redirect: '/adherer' }, 403);
  if (s.voted) return fail(`Vous avez déjà voté. Preuve : ${s.voted.proof.slice(0, 16)}…`, 409);

  if (p.data.action === 'code') {
    const limited = rateLimit(request, 'ag-code:' + u.id, 4, 3600);
    if (limited) return limited;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.delete(verification).where(eq(verification.identifier, ident(u.id)));
    await db.insert(verification).values({ id: randomBytes(16).toString('hex'), identifier: ident(u.id), value: sha(code), expiresAt: new Date(Date.now() + 10 * 60_000) });
    const [me] = await db.select({ phone: userT.phoneNumber, verified: userT.phoneNumberVerified }).from(userT).where(eq(userT.id, u.id));
    const text = `CEA FOR AFRICA : code de signature de votre vote (${AG.title}) : ${code}. Valable 10 minutes. Ne le communiquez à personne.`;
    if (me?.phone && me.verified) { await sendWhatsApp(me.phone, text); return json({ ok: true, channel: 'téléphone', message: `Code envoyé au ${me.phone.slice(0, 4)}…${me.phone.slice(-2)}.` }); }
    await sendEmail(u.email, 'Code de signature de votre vote', text);
    return json({ ok: true, channel: 'e-mail', message: `Code envoyé à ${u.email}.` });
  }

  const limited = rateLimit(request, 'ag-vote:' + u.id, 5, 900);
  if (limited) return limited;
  const [v] = await db.select().from(verification).where(eq(verification.identifier, ident(u.id))).orderBy(desc(verification.createdAt)).limit(1);
  const okCode = v && v.expiresAt > new Date() && timingSafeEqual(Buffer.from(v.value), Buffer.from(sha(p.data.code)));
  if (!okCode) return fail('Code incorrect ou expiré. Demandez un nouveau code.', 401);
  await db.delete(verification).where(eq(verification.identifier, ident(u.id)));
  const at = new Date();
  const [me] = await db.select({ phone: userT.phoneNumber, verified: userT.phoneNumberVerified }).from(userT).where(eq(userT.id, u.id));
  const method = me?.phone && me.verified ? 'telephone' : 'email';
  const proof = sha([AG.id, u.id, p.data.choices.join('|'), at.toISOString(), randomBytes(16).toString('hex')].join('#'));
  const ins = await db.insert(agBallot).values({ assembly: AG.id, userId: u.id, choices: p.data.choices, proof, method, ip: clientIp(request), createdAt: at }).onConflictDoNothing().returning({ id: agBallot.id });
  if (!ins.length) return fail('Vous avez déjà voté.', 409);
  await audit(u.id, 'ag.vote', AG.id, { proof, method }, clientIp(request));
  await notify(u.id, `Vote enregistré (${AG.title}). Preuve : ${proof}`, '/actionnariat/club', { email: true });
  return json({ ok: true, proof, at, message: 'Vote enregistré et signé. Conservez votre preuve de vote.' });
};
