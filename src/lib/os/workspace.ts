/* CEA OS — poste de travail (cahier des charges CEA OS, 5.1), partie base de données ; calculs : workspace-core.ts.
   - runMissions : tâches récurrentes créées chaque jour depuis les missions (AUT-04).
   - taskReminders : rappel au titulaire d'une tâche en retard, puis escalade à son responsable 2 jours après (AUT-05).
   - weeklyReports : le vendredi, chacun est prévenu que son rapport d'activité de la semaine est prêt (ESP-14, AUT-10).
   - activityOf : journal des actions et livrables d'un collaborateur sur une période (ESP-14).
   - agendaOf : réunions, créneaux, échéances, congés d'un collaborateur sur une période (ESP-02, ESP-03). */
import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { osTask, osMission, osMeeting, osAgendaItem, osRequest, osWfDecision, osDocVersion, osDocument, osTimesheet } from '../../db/schema/os';
import { auditLog } from '../../db/schema/app';
import { allStaff, type Person } from './core';
import { notifyStaff } from './approvals';
import { recurrenceDue, ymd } from './workspace-core';

/** Tâches récurrentes du jour (missions actives) ; les missions ponctuelles échues sont désactivées. */
export async function runMissions(now = new Date()) {
  const today = ymd(now);
  const list = await db.select().from(osMission).where(eq(osMission.active, true));
  let created = 0, closed = 0;
  const people = await allStaff();
  for (const m of list) {
    if (m.end && m.end < new Date(today + 'T00:00:00Z')) { await db.update(osMission).set({ active: false }).where(eq(osMission.id, m.id)); closed++; continue; }
    if (m.lastRun === today || !recurrenceDue(m.recurrence, now) || m.start > now) continue;
    const s = people.find((p) => p.id === m.staffId);
    if (!s?.active) continue;
    await db.insert(osTask).values({ title: m.title, owner: m.staffId, country: s.country, domain: m.domain ?? s.domain, due: new Date(today + 'T17:00:00Z'), estimate: m.estimate, missionId: m.id, createdBy: m.staffId });
    await db.update(osMission).set({ lastRun: today }).where(eq(osMission.id, m.id));
    created++;
  }
  return { created, closed };
}

/** Relances : rappel au titulaire d'une tâche en retard, escalade à son responsable (et à qui l'a confiée) 2 jours plus tard. */
export async function taskReminders(now = new Date()) {
  const late = await db.select().from(osTask).where(and(ne(osTask.status, 'Terminé'), lte(osTask.due, now)));
  const people = await allStaff();
  let reminded = 0, escalated = 0;
  for (const t of late) {
    if (!t.remindedAt) {
      await notifyStaff([t.owner], `Tâche en retard : ${t.title}`, '/os/taches?boite=retard', people);
      await db.update(osTask).set({ remindedAt: now }).where(eq(osTask.id, t.id));
      reminded++;
    } else if (!t.escalatedAt && now.getTime() - t.due.getTime() > 2 * 864e5) {
      const o = people.find((p) => p.id === t.owner);
      const to = [o?.managerId, t.delegatedBy].filter((x): x is string => !!x && x !== t.owner);
      if (to.length) await notifyStaff(to, `Escalade — tâche de ${o?.name ?? t.owner} en retard : ${t.title}`, '/os/taches', people);
      await db.update(osTask).set({ escalatedAt: now }).where(eq(osTask.id, t.id));
      escalated++;
    }
  }
  return { reminded, escalated };
}

/** Le vendredi : chaque collaborateur est prévenu que son rapport d'activité de la semaine est prêt. */
export async function weeklyReports(now = new Date()) {
  if ((now.getUTCDay() || 7) !== 5) return { sent: 0 };
  const people = (await allStaff()).filter((p) => p.active && p.userId);
  await notifyStaff(people.map((p) => p.id), 'Votre rapport d’activité de la semaine est prêt', '/os/moi/activite?p=semaine', people);
  return { sent: people.length };
}

export type Activity = { at: Date; kind: string; text: string; link?: string };
const ACTION: Record<string, string> = {
  'os.demande.creation': 'Dossier créé', 'os.demande.approbation': 'Validation donnée', 'os.demande.rejet': 'Rejet motivé', 'os.demande.modification': 'Modification demandée',
  'os.document.depot': 'Document déposé', 'os.document.version': 'Nouvelle version de document', 'os.document.consultation': 'Document consulté', 'os.document.signature': 'Document signé',
  'os.reunion.creation': 'Réunion planifiée', 'os.reunion.compte_rendu': 'Compte rendu de réunion', 'os.temps.saisie': 'Temps déclarés', 'os.delegation.creation': 'Délégation donnée',
};
/** Journal d'activité d'un collaborateur entre deux dates : actions tracées, tâches terminées, décisions, versions de documents, temps. */
export async function activityOf(p: Person, from: Date, to: Date): Promise<{ items: Activity[]; hours: number; tasksDone: number; decisions: number; versions: number }> {
  const [audit, done, decs, vers, hrs] = await Promise.all([
    p.userId ? db.select().from(auditLog).where(and(eq(auditLog.actorId, p.userId), gte(auditLog.at, from), lte(auditLog.at, to), sql`${auditLog.action} like 'os.%'`)) : Promise.resolve([]),
    db.select().from(osTask).where(and(eq(osTask.owner, p.id), gte(osTask.doneAt, from), lte(osTask.doneAt, to))),
    db.select().from(osWfDecision).where(and(eq(osWfDecision.byStaff, p.id), gte(osWfDecision.at, from), lte(osWfDecision.at, to), inArray(osWfDecision.decision, ['approuve', 'rejete', 'modifier', 'soumis', 'resoumis', 'phase']))),
    db.select({ v: osDocVersion, name: osDocument.name }).from(osDocVersion).innerJoin(osDocument, eq(osDocument.id, osDocVersion.documentId)).where(and(eq(osDocVersion.by, p.id), gte(osDocVersion.createdAt, from), lte(osDocVersion.createdAt, to))),
    db.select({ h: sql<number>`coalesce(sum(${osTimesheet.hours}),0)::float` }).from(osTimesheet).where(and(eq(osTimesheet.staffId, p.id), gte(osTimesheet.createdAt, from), lte(osTimesheet.createdAt, to))),
  ]);
  const DEC: Record<string, string> = { approuve: 'Approbation', rejete: 'Rejet', modifier: 'Modification demandée', soumis: 'Soumission', resoumis: 'Nouvelle soumission', phase: 'Dossier avancé' };
  const items: Activity[] = [
    ...done.map((t) => ({ at: t.doneAt!, kind: 'Tâche terminée', text: t.title })),
    ...decs.map((d) => ({ at: d.at, kind: DEC[d.decision] ?? d.decision, text: `${d.requestId}${d.motif ? ' — ' + d.motif : ''}`, link: `/os/flux/${d.requestId}` })),
    ...vers.map(({ v, name }) => ({ at: v.createdAt, kind: 'Version de document', text: `${name} v${v.version}${v.note ? ' — ' + v.note : ''}`, link: `/os/documents/${v.documentId}` })),
    ...audit.filter((a) => ACTION[a.action] && !a.action.startsWith('os.demande')).map((a) => ({ at: a.at, kind: ACTION[a.action], text: a.target ?? '' })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items, hours: Number(hrs[0]?.h ?? 0), tasksDone: done.length, decisions: decs.length, versions: vers.length };
}

export type AgendaEntry = { id: string; start: Date; end: Date; title: string; kind: 'reunion' | 'visite' | 'deplacement' | 'concentration' | 'autre' | 'tache' | 'echeance' | 'conge' | 'dossier'; place?: string; ref?: string; own?: boolean };
/** Agenda d'un collaborateur sur une période : réunions, créneaux personnels, échéances de tâches et de dossiers, congés. */
export async function agendaOf(p: Person, from: Date, to: Date): Promise<AgendaEntry[]> {
  const [meets, blocks, tasks, leaves, dossiers] = await Promise.all([
    db.select().from(osMeeting).where(and(sql`${osMeeting.participants} @> ${JSON.stringify([p.id])}::jsonb`, gte(osMeeting.at, new Date(from.getTime() - 864e5)), lte(osMeeting.at, to))),
    db.select().from(osAgendaItem).where(and(eq(osAgendaItem.staffId, p.id), lte(osAgendaItem.start, to), gte(osAgendaItem.end, from))).orderBy(asc(osAgendaItem.start)),
    db.select().from(osTask).where(and(eq(osTask.owner, p.id), ne(osTask.status, 'Terminé'), gte(osTask.due, from), lte(osTask.due, to))),
    db.select().from(osRequest).where(and(eq(osRequest.byStaff, p.id), eq(osRequest.type, 'conge'), eq(osRequest.status, 'Approuvée'))),
    db.select().from(osRequest).where(and(eq(osRequest.owner, p.id), gte(osRequest.due, from), lte(osRequest.due, to), sql`${osRequest.status} not in ('Clôturé', 'Capitalisé', 'Rejetée')`)),
  ]);
  const out: AgendaEntry[] = [];
  for (const m of meets) {
    const [h, mi] = (m.hour || '09:00').split(':').map(Number);
    const start = new Date(Date.UTC(m.at.getUTCFullYear(), m.at.getUTCMonth(), m.at.getUTCDate(), h || 9, mi || 0));
    if (start > to || start < new Date(from.getTime() - 864e5)) continue;
    out.push({ id: m.id, start, end: new Date(start.getTime() + (m.duration || 60) * 6e4), title: m.title, kind: 'reunion', place: m.place, own: m.organizer === p.id });
  }
  for (const b of blocks) out.push({ id: b.id, start: b.start, end: b.end, title: b.title, kind: b.kind as AgendaEntry['kind'], place: b.place, own: true });
  for (const t of tasks) out.push({ id: t.id, start: t.start ?? new Date(t.due.getTime() - Math.max(0.5, t.estimate) * 36e5), end: t.start ? new Date(t.start.getTime() + Math.max(0.5, t.estimate) * 36e5) : t.due, title: t.title, kind: t.start ? 'tache' : 'echeance', ref: t.id });
  for (const l of leaves) {
    const s = new Date(String(l.data.from) + 'T00:00:00Z'), days = Number(l.data.days) || 0;
    const e = new Date(s.getTime() + Math.ceil(days * 1.4) * 864e5);
    if (e >= from && s <= to) out.push({ id: l.id, start: s, end: e, title: String(l.data.kind ?? 'Congé'), kind: 'conge' });
  }
  for (const d of dossiers) out.push({ id: d.id, start: new Date(d.due!.getTime() - 36e5), end: d.due!, title: `Échéance du dossier ${d.id} — ${d.title}`, kind: 'dossier', ref: d.id });
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Collaborateurs à qui proposer une tâche quand quelqu'un est surchargé : même responsable ou même domaine, actifs. */
export async function teammates(p: Person): Promise<Person[]> {
  const ps = await allStaff();
  return ps.filter((s) => s.active && !s.suspended && s.id !== p.id && ((p.managerId && s.managerId === p.managerId) || (p.domain && s.domain === p.domain) || s.managerId === p.id));
}
/** Heures de tâches ouvertes à échéance dans une fenêtre, par collaborateur. */
export async function openTaskHours(ids: string[], from: Date, to: Date): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const rows = await db.select({ o: osTask.owner, h: sql<number>`coalesce(sum(${osTask.estimate}),0)::float` }).from(osTask)
    .where(and(inArray(osTask.owner, ids), ne(osTask.status, 'Terminé'), lte(osTask.due, to), gte(osTask.due, from))).groupBy(osTask.owner);
  return Object.fromEntries(rows.map((r) => [r.o, Number(r.h)]));
}
