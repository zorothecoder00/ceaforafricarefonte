/* Programmes et cohortes, côté membres (CDC §12).
   POST { action, … } :
   - evaluation.save { applicationId, scores, comment?, conflict, submit } → juré rattaché à l'appel ; brouillon ou évaluation soumise
   - milestone.declare { milestoneId, evidence }                          → participant de la cohorte (validation par l'équipe)
   - followup.declare { cohortId, monthsAfter, … }                        → suivi après programme déclaré par l'ancien participant */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { FOLLOWUP_MONTHS } from '../../lib/followups';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { programmeApplication } from '../../db/schema/app';
import { programmeCall, callJury, evaluation, cohortMember, milestone, milestoneProgress, alumniFollowup } from '../../db/schema/programmes';
import { json, fail, requireUser, audit } from '../../lib/session';
import { Grid, DEFAULT_GRID, weightedTotal } from '../../lib/programmes';

export const prerender = false;

const optInt = (max: number) => z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().int().min(0).max(max).nullish());
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('evaluation.save'), applicationId: z.uuid(), scores: z.record(z.string(), z.coerce.number().int().min(0).max(5)).default({}), comment: z.string().trim().max(3000).nullish(), conflict: z.boolean().default(false), submit: z.boolean().default(false) }),
  z.object({ action: z.literal('milestone.declare'), milestoneId: z.uuid(), evidence: z.string().trim().min(5).max(2000) }),
  z.object({ action: z.literal('followup.declare'), cohortId: z.uuid(), monthsAfter: z.coerce.number().int().refine((m) => (FOLLOWUP_MONTHS as readonly number[]).includes(m)), revenueXof: optInt(1e13), employees: optInt(100000), fundsRaisedXof: optInt(1e13), stillActive: z.boolean().nullish(), notes: z.string().trim().max(2000).nullish() }),
]);
const DECIDED = ['admise', 'refusee', 'retiree', 'liste_attente'];

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire.');
  const b = p.data;

  if (b.action === 'evaluation.save') {
    const [row] = await db.select({ a: programmeApplication, c: programmeCall }).from(programmeApplication).innerJoin(programmeCall, eq(programmeCall.slug, programmeApplication.programme)).where(eq(programmeApplication.id, b.applicationId));
    if (!row) return fail('Candidature introuvable.', 404);
    const [isJury] = await db.select({ u: callJury.userId }).from(callJury).where(and(eq(callJury.callId, row.c.id), eq(callJury.userId, u.id)));
    if (!isJury) return fail('Vous ne faites pas partie du jury de cet appel.', 403);
    if (DECIDED.includes(row.a.status) || row.c.status === 'archive') return fail('La décision est prise : l’évaluation est close.', 409);
    const own = row.a.userId === u.id; // un juré ne note jamais sa propre candidature
    const conflict = b.conflict || own;
    const grid = Grid.safeParse(row.c.grid).success ? (row.c.grid as Grid) : DEFAULT_GRID;
    const scores = Object.fromEntries(Object.entries(b.scores).filter(([k]) => grid.some((c) => c.key === k)));
    const total = conflict ? null : weightedTotal(grid, scores);
    if (b.submit && !conflict && total === null) return fail('Notez chacun des critères avant de soumettre.');
    const [prev] = await db.select({ s: evaluation.submittedAt }).from(evaluation).where(and(eq(evaluation.applicationId, b.applicationId), eq(evaluation.juryId, u.id)));
    const values = { scores: conflict ? {} : scores, total, comment: b.comment ?? null, conflict, submittedAt: b.submit ? new Date() : (prev?.s ?? null), updatedAt: new Date() };
    await db.insert(evaluation).values({ applicationId: b.applicationId, juryId: u.id, ...values })
      .onConflictDoUpdate({ target: [evaluation.applicationId, evaluation.juryId], set: values });
    if (b.submit) await audit(u.id, 'programme.evaluation', row.a.reference, { total, conflict });
    return json({ ok: true, total, message: conflict ? 'Conflit d’intérêts déclaré : vous ne notez pas ce dossier.' : b.submit ? `Évaluation soumise : ${total}/100.` : 'Brouillon enregistré.' });
  }

  if (b.action === 'milestone.declare') {
    const [m] = await db.select().from(milestone).where(eq(milestone.id, b.milestoneId));
    const [isMember] = m ? await db.select({ u: cohortMember.userId }).from(cohortMember).where(and(eq(cohortMember.cohortId, m.cohortId), eq(cohortMember.userId, u.id))) : [];
    if (!m || !isMember) return fail('Jalon introuvable.', 404);
    const [cur] = await db.select().from(milestoneProgress).where(and(eq(milestoneProgress.milestoneId, m.id), eq(milestoneProgress.userId, u.id)));
    if (cur?.status === 'atteint') return fail('Ce jalon est déjà validé.');
    await db.insert(milestoneProgress).values({ milestoneId: m.id, userId: u.id, status: 'declare', evidence: b.evidence })
      .onConflictDoUpdate({ target: [milestoneProgress.milestoneId, milestoneProgress.userId], set: { status: 'declare', evidence: b.evidence, updatedAt: new Date() } });
    return json({ ok: true, message: 'Déclaration envoyée : l’équipe du programme va la valider.' });
  }

  // followup.declare
  const [isMember] = await db.select({ u: cohortMember.userId }).from(cohortMember).where(and(eq(cohortMember.cohortId, b.cohortId), eq(cohortMember.userId, u.id)));
  if (!isMember) return fail('Cohorte introuvable.', 404);
  const [cur] = await db.select({ source: alumniFollowup.source }).from(alumniFollowup).where(and(eq(alumniFollowup.cohortId, b.cohortId), eq(alumniFollowup.userId, u.id), eq(alumniFollowup.monthsAfter, b.monthsAfter)));
  if (cur?.source === 'equipe') return fail('Ce point de suivi a déjà été renseigné avec l’équipe du programme.');
  const { action: _a, ...f } = b;
  const values = { ...f, userId: u.id, revenueXof: f.revenueXof ?? null, employees: f.employees ?? null, fundsRaisedXof: f.fundsRaisedXof ?? null, stillActive: f.stillActive ?? null, notes: f.notes ?? null, source: 'declaration', recordedBy: u.id, recordedAt: new Date() };
  await db.insert(alumniFollowup).values(values).onConflictDoUpdate({ target: [alumniFollowup.cohortId, alumniFollowup.userId, alumniFollowup.monthsAfter], set: values });
  return json({ ok: true, message: 'Merci ! Vos indicateurs aident CEA à mesurer l’impact de ses programmes.' });
};
