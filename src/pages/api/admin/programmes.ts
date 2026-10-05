/* API des programmes et cohortes (CDC §12). Droits : objet « programmes » (§18) — C/M pour préparer et animer, V pour ouvrir un appel
   et décider en comité. Chaque action est journalisée.
   POST { action, … } :
   - call.save { id?, … } · call.status { id, status }
   - jury.add { callId, email } · jury.remove { callId, userId }
   - committee.save { callId, heldOn, members, minutes, decisions: [{ applicationId, status }] } → décisions notifiées, rôle attribué à l'admission
   - cohort.save { id?, … } · cohort.admitted { cohortId } (admis de l'appel lié) · member.add { cohortId, email } · member.status { cohortId, userId, status, reason? }
   - session.save { id?, cohortId, … } · session.delete { id } · attendance.mark { sessionId, marks: [{ userId, status }] }
   - milestone.save { id?, cohortId, … } · milestone.delete { id } · progress.set { milestoneId, userId, status }
   - followup.save { cohortId, userId, monthsAfter, … } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { user } from '../../../db/schema/auth';
import { programmeApplication, userRole } from '../../../db/schema/app';
import { programmeCall, callJury, evaluation, selectionCommittee, cohort, cohortMember, cohortSession, attendance, milestone, milestoneProgress, alumniFollowup } from '../../../db/schema/programmes';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { notify } from '../../../lib/notify';
import { Grid, Fields, aggregate } from '../../../lib/programmes';
import { LEGACY } from '../../../lib/calls';

export const prerender = false;

const id = z.uuid();
const day = z.iso.date();
const optDay = z.preprocess((v) => (v === '' ? null : v), day.nullish());
const optInt = (max: number) => z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().int().min(0).max(max).nullish());
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('call.save'), id: id.optional(), title: z.string().trim().min(3).max(160), slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
    programme: z.string().trim().min(2).max(80), description: z.string().trim().max(3000).default(''),
    opensAt: z.preprocess((v) => (v === '' ? null : v), z.iso.datetime({ offset: true }).nullish()), closesAt: z.preprocess((v) => (v === '' ? null : v), z.iso.datetime({ offset: true }).nullish()),
    reviewsPerApp: z.coerce.number().int().min(1).max(10), role: z.enum(['entrepreneur', '']).default('').transform((v) => v || null), grid: Grid, fields: Fields,
  }),
  z.object({ action: z.literal('call.status'), id, status: z.enum(['brouillon', 'ouvert', 'clos', 'archive']) }),
  z.object({ action: z.literal('jury.add'), callId: id, email: z.email() }),
  z.object({ action: z.literal('jury.remove'), callId: id, userId: z.string().max(64) }),
  z.object({ action: z.literal('committee.save'), callId: id, heldOn: day, members: z.string().trim().min(3).max(1000), minutes: z.string().trim().max(20000).default(''), decisions: z.array(z.object({ applicationId: id, status: z.enum(['admise', 'liste_attente', 'refusee', 'entretien']) })).max(500) }),
  z.object({ action: z.literal('cohort.save'), id: id.optional(), name: z.string().trim().min(2).max(120), programme: z.string().trim().min(2).max(80), callId: z.preprocess((v) => (v === '' ? null : v), id.nullish()), startsOn: optDay, endsOn: optDay, status: z.enum(['a_venir', 'en_cours', 'terminee']).default('a_venir') }),
  z.object({ action: z.literal('cohort.admitted'), cohortId: id }),
  z.object({ action: z.literal('member.add'), cohortId: id, email: z.email() }),
  z.object({ action: z.literal('member.status'), cohortId: id, userId: z.string().max(64), status: z.enum(['actif', 'abandon', 'diplome']), reason: z.string().trim().max(500).nullish() }),
  z.object({ action: z.literal('session.save'), id: id.optional(), cohortId: id, title: z.string().trim().min(2).max(160), kind: z.enum(['atelier', 'mentorat', 'demo_day', 'visite', 'autre']), at: z.iso.datetime({ offset: true }), durationMin: z.coerce.number().int().min(15).max(1440).default(120), place: z.string().trim().max(300).nullish() }),
  z.object({ action: z.literal('session.delete'), id }),
  z.object({ action: z.literal('attendance.mark'), sessionId: id, marks: z.array(z.object({ userId: z.string().max(64), status: z.enum(['present', 'absent', 'excuse']) })).max(500) }),
  z.object({ action: z.literal('milestone.save'), id: id.optional(), cohortId: id, title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).nullish(), dueOn: optDay, position: z.coerce.number().int().min(0).max(100).default(0) }),
  z.object({ action: z.literal('milestone.delete'), id }),
  z.object({ action: z.literal('progress.set'), milestoneId: id, userId: z.string().max(64), status: z.enum(['a_faire', 'declare', 'atteint', 'non_atteint']) }),
  z.object({ action: z.literal('followup.save'), cohortId: id, userId: z.string().max(64), monthsAfter: z.coerce.number().int().refine((m) => [6, 12, 24, 36].includes(m)), revenueXof: optInt(1e13), employees: optInt(100000), fundsRaisedXof: optInt(1e13), stillActive: z.boolean().nullish(), notes: z.string().trim().max(2000).nullish() }),
]);

const DECISION_MSG: Record<string, string> = { entretien: ': vous êtes invité·e à un entretien', admise: 'est acceptée. Félicitations !', liste_attente: 'est sur liste d’attente', refusee: 'n’a pas été retenue cette fois. Merci pour votre candidature.' };

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', '));
  const b = p.data;
  const ip = clientIp(request);
  const needV = b.action === 'committee.save' || (b.action === 'call.status' && b.status !== 'brouillon');
  const u = staffApi(locals.user, 'programmes', needV ? 'V' : b.action.endsWith('.save') && !('id' in b && b.id) ? 'C' : 'M');
  if (u instanceof Response) return u;
  const ok = (message: string, extra: Record<string, unknown> = {}) => json({ ok: true, message, ...extra });
  const memberOf = async (cohortId: string, userId: string) => (await db.select({ u: cohortMember.userId }).from(cohortMember).where(and(eq(cohortMember.cohortId, cohortId), eq(cohortMember.userId, userId)))).length > 0;

  switch (b.action) {
    case 'call.save': {
      const { action: _a, id: cid, opensAt, closesAt, ...f } = b;
      if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) return fail('La clôture doit suivre l’ouverture.');
      const [taken] = await db.select({ id: programmeCall.id }).from(programmeCall).where(and(eq(programmeCall.slug, f.slug), cid ? ne(programmeCall.id, cid) : undefined));
      if (taken) return fail('Cet identifiant est déjà utilisé par un autre appel.');
      const values = { ...f, opensAt: opensAt ? new Date(opensAt) : null, closesAt: closesAt ? new Date(closesAt) : null, updatedAt: new Date() };
      if (cid) {
        const [cur] = await db.select().from(programmeCall).where(eq(programmeCall.id, cid));
        if (!cur) return fail('Appel introuvable.', 404);
        if (cur.slug !== f.slug) {
          const [hasApps] = await db.select({ id: programmeApplication.id }).from(programmeApplication).where(eq(programmeApplication.programme, cur.slug)).limit(1);
          if (hasApps) return fail('Des candidatures sont rattachées à cet appel : son identifiant ne peut plus changer.');
        }
        await db.update(programmeCall).set(values).where(eq(programmeCall.id, cid));
        await audit(u.id, 'programme.appel.maj', cid, {}, ip);
        return ok('Appel enregistré.');
      }
      const [n] = await db.insert(programmeCall).values({ ...values, createdBy: u.id }).returning({ id: programmeCall.id });
      await audit(u.id, 'programme.appel.creation', n.id, { slug: f.slug, reprise: f.slug in LEGACY }, ip);
      return ok('Appel créé.', { redirect: `/admin/programmes/appel/${n.id}` });
    }
    case 'call.status': {
      const [c] = await db.select().from(programmeCall).where(eq(programmeCall.id, b.id));
      if (!c) return fail('Appel introuvable.', 404);
      if (b.status === 'ouvert') {
        if (!Grid.safeParse(c.grid).success) return fail('Grille d’évaluation invalide : la somme des poids doit faire 100.');
        if (!c.closesAt || c.closesAt <= new Date()) return fail('Indiquez une date de clôture à venir avant d’ouvrir l’appel.');
      }
      await db.update(programmeCall).set({ status: b.status, updatedAt: new Date() }).where(eq(programmeCall.id, b.id));
      await audit(u.id, `programme.appel.${b.status}`, b.id, {}, ip);
      return ok('État mis à jour.');
    }
    case 'jury.add': {
      const [j] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.email, b.email.toLowerCase()));
      if (!j) return fail('Aucun compte avec cette adresse : la personne doit d’abord créer son compte sur la plateforme.');
      await db.insert(callJury).values({ callId: b.callId, userId: j.id, addedBy: u.id }).onConflictDoNothing();
      const [c] = await db.select({ title: programmeCall.title }).from(programmeCall).where(eq(programmeCall.id, b.callId));
      await notify(j.id, `Vous êtes membre du jury : ${c?.title ?? 'appel à candidatures'}. Les dossiers à évaluer sont dans votre espace.`, '/espace/jury', { email: true });
      await audit(u.id, 'programme.jury.ajout', b.callId, { jury: j.id }, ip);
      return ok(`${j.name} ajouté·e au jury.`);
    }
    case 'jury.remove': {
      await db.delete(callJury).where(and(eq(callJury.callId, b.callId), eq(callJury.userId, b.userId)));
      await audit(u.id, 'programme.jury.retrait', b.callId, { jury: b.userId }, ip);
      return ok('Retiré du jury (ses évaluations déjà soumises sont conservées).');
    }
    case 'committee.save': {
      const [c] = await db.select().from(programmeCall).where(eq(programmeCall.id, b.callId));
      if (!c) return fail('Appel introuvable.', 404);
      const apps = b.decisions.length ? await db.select().from(programmeApplication).where(and(eq(programmeApplication.programme, c.slug), inArray(programmeApplication.id, b.decisions.map((d) => d.applicationId)))) : [];
      if (apps.length !== b.decisions.length) return fail('Une des candidatures ne relève pas de cet appel.');
      const [com] = await db.insert(selectionCommittee).values({ callId: c.id, heldOn: b.heldOn, members: b.members, minutes: b.minutes, createdBy: u.id }).returning({ id: selectionCommittee.id });
      const evals = await db.select().from(evaluation).where(inArray(evaluation.applicationId, apps.map((a) => a.id).concat(['00000000-0000-4000-8000-000000000000'])));
      let changed = 0;
      for (const d of b.decisions) {
        const a = apps.find((x) => x.id === d.applicationId)!;
        const agg = aggregate(evals.filter((e) => e.applicationId === a.id), c.reviewsPerApp);
        await db.update(programmeApplication).set({ status: d.status, score: agg.mean ?? a.score, updatedAt: new Date() }).where(eq(programmeApplication.id, a.id));
        if (d.status === 'admise' && c.role) await db.insert(userRole).values({ userId: a.userId, role: c.role as 'entrepreneur' }).onConflictDoNothing();
        if (d.status !== a.status) {
          changed++;
          await notify(a.userId, `Votre candidature ${a.reference} ${DECISION_MSG[d.status]}`, '/espace/candidatures', { email: true, whatsapp: d.status === 'admise' || d.status === 'entretien' });
          await audit(u.id, 'programme.comite.decision', a.reference, { committee: com.id, from: a.status, to: d.status, score: agg.mean }, ip);
        }
      }
      await audit(u.id, 'programme.comite', com.id, { call: c.id, decisions: b.decisions.length }, ip);
      return ok(`Comité enregistré : ${changed} décision${changed > 1 ? 's' : ''} notifiée${changed > 1 ? 's' : ''}.`);
    }
    case 'cohort.save': {
      const { action: _a, id: cid, ...f } = b;
      if (cid) {
        await db.update(cohort).set(f).where(eq(cohort.id, cid));
        await audit(u.id, 'programme.cohorte.maj', cid, { status: f.status }, ip);
        return ok('Cohorte enregistrée.');
      }
      const [n] = await db.insert(cohort).values({ ...f, createdBy: u.id }).returning({ id: cohort.id });
      await audit(u.id, 'programme.cohorte.creation', n.id, {}, ip);
      return ok('Cohorte créée.', { redirect: `/admin/programmes/cohorte/${n.id}` });
    }
    case 'cohort.admitted': {
      const [co] = await db.select().from(cohort).where(eq(cohort.id, b.cohortId));
      if (!co?.callId) return fail('Rattachez d’abord la cohorte à un appel.');
      const [c] = await db.select({ slug: programmeCall.slug }).from(programmeCall).where(eq(programmeCall.id, co.callId));
      const admitted = c ? await db.select().from(programmeApplication).where(and(eq(programmeApplication.programme, c.slug), eq(programmeApplication.status, 'admise'))) : [];
      if (!admitted.length) return fail('Aucune candidature admise pour cet appel.');
      const res = await db.insert(cohortMember).values(admitted.map((a) => ({ cohortId: co.id, userId: a.userId, applicationId: a.id }))).onConflictDoNothing().returning({ u: cohortMember.userId });
      for (const r of res) await notify(r.u, `Bienvenue dans la cohorte « ${co.name} ». Votre programme, vos séances et vos jalons sont dans votre espace.`, '/espace/programme', { email: true });
      await audit(u.id, 'programme.cohorte.admis', co.id, { added: res.length }, ip);
      return ok(`${res.length} participant${res.length > 1 ? 's' : ''} ajouté${res.length > 1 ? 's' : ''}.`);
    }
    case 'member.add': {
      const [m] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.email, b.email.toLowerCase()));
      if (!m) return fail('Aucun compte avec cette adresse.');
      const [co] = await db.select({ name: cohort.name }).from(cohort).where(eq(cohort.id, b.cohortId));
      if (!co) return fail('Cohorte introuvable.', 404);
      await db.insert(cohortMember).values({ cohortId: b.cohortId, userId: m.id }).onConflictDoNothing();
      await notify(m.id, `Bienvenue dans la cohorte « ${co.name} ».`, '/espace/programme', { email: true });
      await audit(u.id, 'programme.cohorte.ajout', b.cohortId, { member: m.id }, ip);
      return ok(`${m.name} ajouté·e.`);
    }
    case 'member.status': {
      if (b.status === 'abandon' && !b.reason) return fail('Indiquez le motif de l’abandon (suivi du risque d’abandon).');
      await db.update(cohortMember).set({ status: b.status, reason: b.reason ?? null, leftAt: b.status === 'actif' ? null : new Date() }).where(and(eq(cohortMember.cohortId, b.cohortId), eq(cohortMember.userId, b.userId)));
      await audit(u.id, 'programme.cohorte.statut', b.cohortId, { member: b.userId, status: b.status }, ip);
      return ok('Statut mis à jour.');
    }
    case 'session.save': {
      const { action: _a, id: sid, at, ...f } = b;
      const values = { ...f, at: new Date(at), place: f.place ?? null };
      if (sid) await db.update(cohortSession).set(values).where(eq(cohortSession.id, sid));
      else await db.insert(cohortSession).values(values);
      return ok('Séance enregistrée.');
    }
    case 'session.delete': {
      await db.delete(cohortSession).where(eq(cohortSession.id, b.id));
      return ok('Séance supprimée.');
    }
    case 'attendance.mark': {
      const [s] = await db.select({ cohortId: cohortSession.cohortId }).from(cohortSession).where(eq(cohortSession.id, b.sessionId));
      if (!s) return fail('Séance introuvable.', 404);
      for (const m of b.marks) {
        if (!(await memberOf(s.cohortId, m.userId))) continue;
        await db.insert(attendance).values({ sessionId: b.sessionId, userId: m.userId, status: m.status, markedBy: u.id })
          .onConflictDoUpdate({ target: [attendance.sessionId, attendance.userId], set: { status: m.status, markedBy: u.id, markedAt: new Date() } });
      }
      return ok('Présence enregistrée.');
    }
    case 'milestone.save': {
      const { action: _a, id: mid, ...f } = b;
      const values = { ...f, description: f.description ?? null };
      if (mid) await db.update(milestone).set(values).where(eq(milestone.id, mid));
      else await db.insert(milestone).values(values);
      return ok('Jalon enregistré.');
    }
    case 'milestone.delete': {
      await db.delete(milestone).where(eq(milestone.id, b.id));
      return ok('Jalon supprimé.');
    }
    case 'progress.set': {
      const [m] = await db.select({ cohortId: milestone.cohortId, title: milestone.title }).from(milestone).where(eq(milestone.id, b.milestoneId));
      if (!m || !(await memberOf(m.cohortId, b.userId))) return fail('Jalon ou participant introuvable.', 404);
      await db.insert(milestoneProgress).values({ milestoneId: b.milestoneId, userId: b.userId, status: b.status, validatedBy: u.id })
        .onConflictDoUpdate({ target: [milestoneProgress.milestoneId, milestoneProgress.userId], set: { status: b.status, validatedBy: u.id, updatedAt: new Date() } });
      if (b.status === 'atteint') await notify(b.userId, `Jalon validé : ${m.title}`, '/espace/programme');
      return ok('Avancement enregistré.');
    }
    case 'followup.save': {
      if (!(await memberOf(b.cohortId, b.userId))) return fail('Participant introuvable dans cette cohorte.', 404);
      const { action: _a, ...f } = b;
      const values = { ...f, revenueXof: f.revenueXof ?? null, employees: f.employees ?? null, fundsRaisedXof: f.fundsRaisedXof ?? null, stillActive: f.stillActive ?? null, notes: f.notes ?? null, source: 'equipe', recordedBy: u.id, recordedAt: new Date() };
      await db.insert(alumniFollowup).values(values).onConflictDoUpdate({ target: [alumniFollowup.cohortId, alumniFollowup.userId, alumniFollowup.monthsAfter], set: values });
      await audit(u.id, 'programme.suivi', b.cohortId, { member: b.userId, months: b.monthsAfter }, ip);
      return ok('Suivi enregistré.');
    }
  }
};
