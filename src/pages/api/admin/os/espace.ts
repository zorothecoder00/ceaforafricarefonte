/* CEA OS — poste de travail du collaborateur (cahier des charges CEA OS, 5.1).
   POST JSON :
   { action: 'mission.save', id?, title, kind, recurrence?, estimate, domain, start?, end?, active } · { action: 'mission.delete', id }
   { action: 'mission.import' }                          → missions permanentes reprises de la fiche de poste
   { action: 'objective.save', id?, period, title, target, current, unit, okrId? } · { action: 'objective.delete', id }
   { action: 'agenda.save', id?, kind, title, date, from, to, place } → conflits signalés · { action: 'agenda.delete', id }
   { action: 'task.plan', id, start (AAAA-MM-JJTHH:MM) | '', estimate?, priority? }
   { action: 'task.delegate', id, to }                   → la tâche est confiée à un collègue ; elle reste suivie dans « Déléguées »
   { action: 'task.reassign', id, to }                   → un responsable rééquilibre la charge de son équipe
   { action: 'plan.generate', date }                     → plan du jour : les tâches prioritaires reçoivent un créneau
   { action: 'skill.save', name, level, target, certification?, certExpires?, plan?, planDue? } · { action: 'skill.delete', name }
   { action: 'skill.import' }                            → compétences attendues par la fiche de poste */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osMission, osObjective, osAgendaItem, osTask, osSkill, osOkr } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { allStaff } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { agendaOf } from '../../../../lib/os/workspace';
import { conflicts, dayPlan, periodKey, priorityScore } from '../../../../lib/os/workspace-core';
import { DK, poste } from '../../../../lib/os/ref';

export const prerender = false;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ.');
const Hour = z.string().regex(/^\d{2}:\d{2}$/, 'Heure au format HH:MM.');
const Rec = z.string().regex(/^(|jour|semaine:[1-7]|mois:([1-9]|1\d|2[0-8]))$/, 'Récurrence inconnue.');
const Bool = z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean());
const Emp = z.string().regex(/^EMP\d{3,6}$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mission.save'), id: z.uuid().optional().or(z.literal('')), title: z.string().trim().min(3).max(200), kind: z.enum(['permanente', 'ponctuelle']), recurrence: Rec.default(''), estimate: z.coerce.number().min(0.25).max(40).default(1), domain: z.enum(DK as [string, ...string[]]).optional().or(z.literal('')), start: Day.optional().or(z.literal('')), end: Day.optional().or(z.literal('')), active: Bool.default(true) }),
  z.object({ action: z.literal('mission.delete'), id: z.uuid() }),
  z.object({ action: z.literal('mission.import') }),
  z.object({ action: z.literal('objective.save'), id: z.uuid().optional().or(z.literal('')), period: z.enum(['semaine', 'mois', 'trimestre']), title: z.string().trim().min(3).max(200), target: z.coerce.number().positive().max(1e12), current: z.coerce.number().min(0).max(1e12).default(0), unit: z.string().trim().max(20).default('%'), okrId: z.uuid().optional().or(z.literal('')) }),
  z.object({ action: z.literal('objective.delete'), id: z.uuid() }),
  z.object({ action: z.literal('agenda.save'), id: z.uuid().optional().or(z.literal('')), kind: z.enum(['visite', 'deplacement', 'concentration', 'autre']), title: z.string().trim().min(2).max(200), date: Day, from: Hour, to: Hour, place: z.string().trim().max(200).default('') }),
  z.object({ action: z.literal('agenda.delete'), id: z.uuid() }),
  z.object({ action: z.literal('task.plan'), id: z.uuid(), start: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/), estimate: z.coerce.number().min(0.25).max(80).optional(), priority: z.enum(['urgente', 'haute', 'normale', 'basse']).optional() }),
  z.object({ action: z.literal('task.delegate'), id: z.uuid(), to: Emp }),
  z.object({ action: z.literal('task.reassign'), id: z.uuid(), to: Emp }),
  z.object({ action: z.literal('plan.generate'), date: Day }),
  z.object({ action: z.literal('skill.save'), name: z.string().trim().min(2).max(120), level: z.coerce.number().int().min(1).max(5), target: z.coerce.number().int().min(1).max(5), certification: z.string().trim().max(200).optional().default(''), certExpires: Day.optional().or(z.literal('')), plan: z.string().trim().max(500).optional().default(''), planDue: Day.optional().or(z.literal('')) }),
  z.object({ action: z.literal('skill.delete'), name: z.string().min(1).max(120) }),
  z.object({ action: z.literal('skill.import') }),
]);
const d = (s?: string) => (s ? new Date(s + 'T00:00:00Z') : null);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const mine = <T extends { staffId: string }>(x: T | undefined) => !!x && x.staffId === me.id;

  switch (b.action) {
    case 'mission.save': {
      const v = { title: b.title, kind: b.kind, recurrence: b.recurrence || null, estimate: b.estimate, domain: b.domain || me.domain, start: d(b.start) ?? new Date(), end: b.kind === 'ponctuelle' ? d(b.end) : null, active: b.active };
      if (b.kind === 'ponctuelle' && !v.end) return fail('Une mission ponctuelle a une date de fin.');
      if (b.id) {
        const [m] = await db.select().from(osMission).where(eq(osMission.id, b.id));
        if (!mine(m)) return fail('Mission introuvable.', 404);
        await db.update(osMission).set(v).where(eq(osMission.id, b.id));
      } else await db.insert(osMission).values({ ...v, staffId: me.id });
      return json({ ok: true, message: b.recurrence ? 'Mission enregistrée : ses tâches seront créées automatiquement.' : 'Mission enregistrée.' });
    }
    case 'mission.delete': {
      const [m] = await db.select().from(osMission).where(eq(osMission.id, b.id));
      if (!mine(m)) return fail('Mission introuvable.', 404);
      await db.delete(osMission).where(eq(osMission.id, b.id));
      return json({ ok: true, message: 'Mission supprimée (ses tâches déjà créées restent).' });
    }
    case 'mission.import': {
      const fiche = poste(me.poste);
      if (!fiche?.m?.length) return fail('Votre fiche de poste ne décrit pas de missions.');
      const have = new Set((await db.select({ t: osMission.title }).from(osMission).where(eq(osMission.staffId, me.id))).map((x) => x.t));
      const add = fiche.m.map(([t]) => t).filter((t) => !have.has(t));
      if (add.length) await db.insert(osMission).values(add.map((title) => ({ staffId: me.id, title, kind: 'permanente', domain: me.domain })));
      return json({ ok: true, message: add.length ? `${add.length} mission(s) reprise(s) de votre fiche de poste : choisissez leur récurrence.` : 'Toutes les missions de la fiche sont déjà présentes.' });
    }
    case 'objective.save': {
      if (b.okrId) { const [o] = await db.select({ id: osOkr.id }).from(osOkr).where(eq(osOkr.id, b.okrId)); if (!o) return fail('OKR inconnu.'); }
      const v = { period: b.period, periodKey: periodKey(b.period), title: b.title, target: b.target, current: b.current, unit: b.unit || '%', okrId: b.okrId || null };
      if (b.id) {
        const [o] = await db.select().from(osObjective).where(eq(osObjective.id, b.id));
        if (!mine(o)) return fail('Objectif introuvable.', 404);
        await db.update(osObjective).set({ ...v, periodKey: o!.periodKey }).where(eq(osObjective.id, b.id));
      } else await db.insert(osObjective).values({ ...v, staffId: me.id });
      return json({ ok: true, message: 'Objectif enregistré.' });
    }
    case 'objective.delete': {
      const [o] = await db.select().from(osObjective).where(eq(osObjective.id, b.id));
      if (!mine(o)) return fail('Objectif introuvable.', 404);
      await db.update(osTask).set({ objectiveId: null }).where(eq(osTask.objectiveId, b.id));
      await db.delete(osObjective).where(eq(osObjective.id, b.id));
      return json({ ok: true, message: 'Objectif supprimé.' });
    }
    case 'agenda.save': {
      const start = new Date(`${b.date}T${b.from}:00Z`), end = new Date(`${b.date}T${b.to}:00Z`);
      if (end <= start) return fail('L’heure de fin doit suivre l’heure de début.');
      if (b.id) {
        const [a] = await db.select().from(osAgendaItem).where(eq(osAgendaItem.id, b.id));
        if (!mine(a)) return fail('Créneau introuvable.', 404);
        await db.update(osAgendaItem).set({ kind: b.kind, title: b.title, start, end, place: b.place }).where(eq(osAgendaItem.id, b.id));
      } else await db.insert(osAgendaItem).values({ staffId: me.id, kind: b.kind, title: b.title, start, end, place: b.place });
      // Détection des conflits (ESP-02) : réunions, autres créneaux, congés
      const day = await agendaOf(me, new Date(`${b.date}T00:00:00Z`), new Date(`${b.date}T23:59:59Z`));
      const clash = conflicts(day.filter((x) => x.kind !== 'echeance' && x.kind !== 'dossier')).filter(([x, y]) => [x, y].some((z) => z.title === b.title && z.start.getTime() === start.getTime()));
      const other = clash.map(([x, y]) => (x.title === b.title && x.start.getTime() === start.getTime() ? y : x).title);
      return json({ ok: true, message: other.length ? `Créneau enregistré — attention, conflit avec : ${[...new Set(other)].join(', ')}.` : 'Créneau enregistré, sans conflit.' });
    }
    case 'agenda.delete': {
      const [a] = await db.select().from(osAgendaItem).where(eq(osAgendaItem.id, b.id));
      if (!mine(a)) return fail('Créneau introuvable.', 404);
      await db.delete(osAgendaItem).where(eq(osAgendaItem.id, b.id));
      return json({ ok: true, message: 'Créneau supprimé.' });
    }
    case 'task.plan': {
      const [t] = await db.select().from(osTask).where(eq(osTask.id, b.id));
      if (!t || t.owner !== me.id) return fail('Tâche introuvable.', 404);
      await db.update(osTask).set({ start: b.start ? new Date(b.start + ':00Z') : null, ...(b.estimate ? { estimate: b.estimate } : {}), ...(b.priority ? { priority: b.priority } : {}) }).where(eq(osTask.id, b.id));
      return json({ ok: true, message: b.start ? 'Tâche planifiée.' : 'Tâche retirée du planning.' });
    }
    case 'task.delegate':
    case 'task.reassign': {
      const [t] = await db.select().from(osTask).where(eq(osTask.id, b.id));
      if (!t) return fail('Tâche introuvable.', 404);
      const people = await allStaff();
      const to = people.find((x) => x.id === b.to && x.active);
      const owner = people.find((x) => x.id === t.owner);
      if (!to || to.id === t.owner) return fail('Destinataire invalide.');
      if (b.action === 'task.delegate' && t.owner !== me.id) return fail('Seul le titulaire délègue sa tâche.', 403);
      if (b.action === 'task.reassign' && owner?.managerId !== me.id && me.prof !== 'dg') return fail('Seul le responsable du titulaire réaffecte une tâche.', 403);
      await db.update(osTask).set({ owner: to.id, country: to.country, delegatedBy: t.delegatedBy ?? me.id, start: null, remindedAt: null, escalatedAt: null }).where(eq(osTask.id, t.id));
      await notifyStaff([to.id], `${me.name} vous confie une tâche : ${t.title}`, '/os/taches', people);
      if (b.action === 'task.reassign' && owner) await notifyStaff([owner.id], `Tâche réaffectée à ${to.name} pour équilibrer la charge : ${t.title}`, '/os/moi/charge', people);
      await audit(me.userId, b.action === 'task.delegate' ? 'os.tache.delegation' : 'os.tache.reaffectation', t.id, { de: t.owner, vers: to.id });
      return json({ ok: true, message: `Tâche confiée à ${to.name}.` });
    }
    case 'plan.generate': {
      const day = new Date(b.date + 'T00:00:00Z'), end = new Date(b.date + 'T23:59:59Z');
      const fixed = (await agendaOf(me, day, end)).filter((x) => !['echeance', 'dossier', 'conge'].includes(x.kind));
      const open = (await db.select().from(osTask).where(and(eq(osTask.owner, me.id), ne(osTask.status, 'Terminé')))).filter((t) => !t.start || t.start.toISOString().slice(0, 10) === b.date);
      const plan = dayPlan(day, fixed.map((x) => ({ start: x.start, end: x.end, title: x.title, kind: x.kind })), open.map((t) => ({ id: t.id, title: t.title, estimate: t.estimate, score: priorityScore(t, day) })));
      for (const s of plan.slots) if (s.ref) await db.update(osTask).set({ start: s.start }).where(eq(osTask.id, s.ref));
      for (const t of plan.later) await db.update(osTask).set({ start: null }).where(eq(osTask.id, t.id));
      return json({ ok: true, message: `Plan du ${day.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} : ${plan.slots.filter((s) => s.ref).length} tâche(s) placée(s)${plan.later.length ? `, ${plan.later.length} à reporter (journée pleine)` : ''}.` });
    }
    case 'skill.save': {
      await db.insert(osSkill).values({ staffId: me.id, name: b.name, level: b.level, target: b.target, certification: b.certification || null, certExpires: d(b.certExpires), plan: b.plan || null, planDue: d(b.planDue) })
        .onConflictDoUpdate({ target: [osSkill.staffId, osSkill.name], set: { level: b.level, target: b.target, certification: b.certification || null, certExpires: d(b.certExpires), plan: b.plan || null, planDue: d(b.planDue), updatedAt: new Date() } });
      return json({ ok: true, message: b.level < b.target && !b.plan ? 'Enregistré — un écart au poste demande une action de développement.' : 'Compétence enregistrée.' });
    }
    case 'skill.delete':
      await db.delete(osSkill).where(and(eq(osSkill.staffId, me.id), eq(osSkill.name, b.name)));
      return json({ ok: true, message: 'Compétence retirée.' });
    case 'skill.import': {
      const fiche = poste(me.poste);
      if (!fiche?.tech?.length) return fail('Votre fiche de poste ne liste pas de compétences.');
      await db.insert(osSkill).values(fiche.tech.map((name) => ({ staffId: me.id, name: name.slice(0, 120), level: 1, target: 3 }))).onConflictDoNothing();
      return json({ ok: true, message: `${fiche.tech.length} compétence(s) attendue(s) par votre poste : indiquez votre niveau.` });
    }
  }
};
