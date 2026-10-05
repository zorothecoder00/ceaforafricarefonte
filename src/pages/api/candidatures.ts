/* Candidatures aux programmes (CDC §7.5, §7.6) : accélérateur, Investor Ready, Mastermind, programmes sectoriels.
   POST { programme, data } → accusé de réception avec numéro. Une candidature active par programme. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '../../lib/db';
import { programmeApplication, userRole } from '../../db/schema/app';
import { json, fail, requireUser, reference, audit } from '../../lib/session';
import { notify } from '../../lib/notify';
import { resolveProgramme } from '../../lib/calls';
import { checkAnswers } from '../../lib/programmes';
import { message } from '../../lib/templates';

export const prerender = false;

// Corps : { programme, data } (formulaire en étapes) ou champs à plat (formulaire simple)
const Body = z.looseObject({ programme: z.string().max(60), data: z.record(z.string(), z.unknown()).optional() }).transform(({ programme, data, website: _w, ...rest }) => ({ programme, data: data ?? rest }));

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Programme inconnu.');
  const prog = await resolveProgramme(p.data.programme);
  // Un appel en brouillon ou archivé n'est pas public : il est introuvable
  if (!prog || prog.state === 'brouillon' || prog.state === 'archive') return fail('Programme inconnu.', 404);
  if (prog.state !== 'ouvert') return fail(prog.state === 'a_venir' ? 'Les candidatures ne sont pas encore ouvertes.' : 'Les candidatures sont closes.', 409);
  const existing = await db.select().from(programmeApplication).where(and(eq(programmeApplication.userId, u.id), eq(programmeApplication.programme, p.data.programme), notInArray(programmeApplication.status, ['refusee', 'retiree'])));
  if (existing.length) return json({ ok: true, reference: existing[0].reference, message: `Vous avez déjà une candidature en cours (${existing[0].reference}).`, redirect: '/espace/candidatures' });
  // Appel créé dans le back-office : réponses contrôlées selon son formulaire ; programme historique : champs du formulaire codé
  let data = Object.fromEntries(Object.entries(p.data.data).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 5000) : v]));
  if (prog.fields) {
    const chk = checkAnswers(prog.fields, data);
    if (!chk.ok) return fail(chk.error);
    data = { ...chk.data, ...(Array.isArray(data.documents) ? { documents: data.documents } : {}) };
  }
  const ref = reference(prog.prefix);
  await db.insert(programmeApplication).values({ reference: ref, userId: u.id, programme: p.data.programme, data });
  if (prog.role) await db.insert(userRole).values({ userId: u.id, role: prog.role }).onConflictDoNothing();
  await audit(u.id, 'candidature', ref, { programme: p.data.programme });
  await notify(u.id, await message('candidature.recue', { reference: ref, programme: prog.label }), '/espace/candidatures', { email: true, whatsapp: true });
  return json({ ok: true, reference: ref, message: `Candidature ${ref} reçue.` });
};
