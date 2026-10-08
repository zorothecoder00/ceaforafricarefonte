/* Tests de compétences (CDC §7.4), membres connectés.
   POST { action: 'commencer', testId }           → ouvre (ou reprend) un passage ; renvoie les questions et l'heure limite
   POST { action: 'rendre', attemptId, answers }  → corrige côté serveur ; badge vérifiable délivré à 70 % */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail, requireUser } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';
import { startTest, submitTest, shownQuestions, deadline } from '../../../lib/skill-tests';
import { findTest, PASS } from '../../../data/skill-tests';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('commencer'), testId: z.string().max(40) }),
  z.object({ action: z.literal('rendre'), attemptId: z.uuid(), answers: z.array(z.number().int().min(-1).max(10)).max(30) }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'tests', 20, 600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  if (p.data.action === 'commencer') {
    const r = await startTest(u.id, p.data.testId);
    if ('error' in r) return fail(r.error!);
    const t = findTest(r.attempt.testId)!;
    return json({ ok: true, attemptId: r.attempt.id, deadline: deadline(r.attempt, t).toISOString(), questions: shownQuestions(t, r.attempt) });
  }
  const r = await submitTest(u.id, p.data.attemptId, p.data.answers);
  if ('error' in r) return fail(r.error!);
  const message = r.late ? 'Temps écoulé : le passage n’a pas pu être pris en compte.'
    : r.passed ? `Réussi : ${r.score}/${r.total}. Votre badge vérifiable est ajouté à votre profil.`
    : `${r.score}/${r.total} : il faut ${Math.ceil(PASS * r.total)} bonnes réponses. Nouvelle tentative possible dans 30 jours.`;
  return json({ ok: true, ...r, message });
};
