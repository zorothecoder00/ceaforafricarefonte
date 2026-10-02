/* Candidatures aux programmes (CDC §7.5, §7.6) : accélérateur, Investor Ready, Mastermind, programmes sectoriels.
   POST { programme, data } → accusé de réception avec numéro. Une candidature active par programme. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '../../lib/db';
import { programmeApplication, userRole } from '../../db/schema/app';
import { json, fail, requireUser, reference, audit } from '../../lib/session';
import { notify } from '../../lib/notify';

export const prerender = false;

export const PROGRAMMES: Record<string, { label: string; prefix: string; role?: 'entrepreneur' }> = {
  'accelerateur-c4': { label: 'Accélérateur — Cohorte 4', prefix: 'CAND', role: 'entrepreneur' },
  'investor-ready': { label: 'Programme Investor Ready', prefix: 'IR', role: 'entrepreneur' },
  mastermind: { label: 'Mastermind Circles', prefix: 'MM' },
  'femmes-entrepreneures': { label: 'Femmes entrepreneures', prefix: 'FE', role: 'entrepreneur' },
  'diaspora-connect': { label: 'Diaspora Connect', prefix: 'DC' },
  'agritech-sahel': { label: 'Agritech Sahel', prefix: 'AS', role: 'entrepreneur' },
};

// Corps : { programme, data } (formulaire en étapes) ou champs à plat (formulaire simple)
const Body = z.looseObject({ programme: z.string().refine((p) => p in PROGRAMMES, 'Programme inconnu'), data: z.record(z.string(), z.unknown()).optional() }).transform(({ programme, data, website: _w, ...rest }) => ({ programme, data: data ?? rest }));

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Programme inconnu.');
  const prog = PROGRAMMES[p.data.programme];
  const existing = await db.select().from(programmeApplication).where(and(eq(programmeApplication.userId, u.id), eq(programmeApplication.programme, p.data.programme), notInArray(programmeApplication.status, ['refusee', 'retiree'])));
  if (existing.length) return json({ ok: true, reference: existing[0].reference, message: `Vous avez déjà une candidature en cours (${existing[0].reference}).`, redirect: '/espace/candidatures' });
  const data = Object.fromEntries(Object.entries(p.data.data).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 5000) : v]));
  const ref = reference(prog.prefix);
  await db.insert(programmeApplication).values({ reference: ref, userId: u.id, programme: p.data.programme, data });
  if (prog.role) await db.insert(userRole).values({ userId: u.id, role: prog.role }).onConflictDoNothing();
  await audit(u.id, 'candidature', ref, { programme: p.data.programme });
  await notify(u.id, `Candidature ${ref} reçue : ${prog.label}. Prochaine étape : diagnostic de maturité.`, '/espace/candidatures', { email: true, whatsapp: true });
  return json({ ok: true, reference: ref, message: `Candidature ${ref} reçue.` });
};
