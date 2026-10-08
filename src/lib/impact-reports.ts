/* Rapports d'impact générés automatiquement (CDC §7.9) : par programme (cohortes, participants, présence, jalons, suivi à
   3/6/12 mois, emplois et fonds levés déclarés) et par partenaire (conventions gagnées du CRM, programmes cofinancés et
   événements sponsorisés). Les montants et la part de femmes ne sont donnés qu'à partir de 10 personnes (MIN_CELL). */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { cohort, cohortMember, attendance, cohortSession, milestone, milestoneProgress, alumniFollowup, programmeCall } from '../db/schema/programmes';
import { programmeApplication, eventTicket } from '../db/schema/app';
import { crmOrg, crmDeal } from '../db/schema/crm';
import { allEvents } from './catalog';
import { publishable, MIN_CELL } from './impact';

/** Programmes connus : ceux des cohortes et des appels à candidatures. */
export async function programmeNames() {
  const rows = await db.execute(sql`select distinct programme p from cohort union select distinct programme from programme_call order by 1`);
  return (rows.rows as { p: string }[]).map((r) => r.p).filter(Boolean);
}

export type ProgrammeReport = Awaited<ReturnType<typeof programmeReport>>;

export async function programmeReport(name: string) {
  const cohorts = await db.select().from(cohort).where(eq(cohort.programme, name)).orderBy(cohort.startsOn);
  const ids = cohorts.map((c) => c.id);
  const members = ids.length ? await db.select().from(cohortMember).where(inArray(cohortMember.cohortId, ids)) : [];
  const users = [...new Set(members.map((m) => m.userId))];
  const active = members.filter((m) => m.status !== 'abandon');
  const graduated = members.filter((m) => m.status === 'diplome').length;
  const dropped = members.filter((m) => m.status === 'abandon').length;

  const sessions = ids.length ? await db.select({ id: cohortSession.id }).from(cohortSession).where(inArray(cohortSession.cohortId, ids)) : [];
  const marks = sessions.length ? await db.select({ s: attendance.status }).from(attendance).where(inArray(attendance.sessionId, sessions.map((s) => s.id))) : [];
  const stones = ids.length ? await db.select({ id: milestone.id }).from(milestone).where(inArray(milestone.cohortId, ids)) : [];
  const progress = stones.length ? await db.select({ s: milestoneProgress.status }).from(milestoneProgress).where(inArray(milestoneProgress.milestoneId, stones.map((m) => m.id))) : [];

  // Genre déclaré dans les candidatures des participants (non-réponses exclues)
  const apps = users.length ? await db.select({ u: programmeApplication.userId, g: sql<string | null>`${programmeApplication.data}->>'genre'` }).from(programmeApplication).where(inArray(programmeApplication.userId, users)) : [];
  const declared = new Map<string, string>();
  for (const a of apps) if (a.g === 'Femme' || a.g === 'Homme') declared.set(a.u, a.g);
  const women = [...declared.values()].filter((g) => g === 'Femme').length;

  // Suivi long terme : réponses par échéance, puis dernier point de chaque ancien
  const follow = ids.length ? await db.select().from(alumniFollowup).where(inArray(alumniFollowup.cohortId, ids)) : [];
  const byMonths = new Map<number, number>();
  for (const f of follow) byMonths.set(f.monthsAfter, (byMonths.get(f.monthsAfter) ?? 0) + 1);
  const latest = new Map<string, (typeof follow)[number]>();
  for (const f of follow) { const k = `${f.cohortId}|${f.userId}`; if (!latest.has(k) || latest.get(k)!.monthsAfter < f.monthsAfter) latest.set(k, f); }
  const last = [...latest.values()];
  const employees = last.reduce((n, f) => n + (f.employees ?? 0), 0);
  const funds = last.reduce((n, f) => n + (f.fundsRaisedXof ?? 0), 0);
  const revenue = last.reduce((n, f) => n + (f.revenueXof ?? 0), 0);
  const stillActive = last.filter((f) => f.stillActive === true).length;

  const calls = await db.select({ title: programmeCall.title, status: programmeCall.status }).from(programmeCall).where(eq(programmeCall.programme, name));
  const appsCount = calls.length ? Number(((await db.execute(sql`select count(*) n from programme_application a join programme_call c on c.slug = a.programme where c.programme = ${name}`)).rows[0] as { n: string }).n) : 0;

  return {
    name, generatedAt: new Date(),
    cohorts: cohorts.map((c) => ({ name: c.name, startsOn: c.startsOn, endsOn: c.endsOn, status: c.status, members: members.filter((m) => m.cohortId === c.id && m.status !== 'abandon').length })),
    applications: appsCount,
    participants: active.length, graduated, dropped,
    retention: members.length ? Math.round((active.length / members.length) * 100) : null,
    attendance: marks.length ? Math.round((marks.filter((m) => m.s === 'present').length / marks.length) * 100) : null,
    milestones: { total: stones.length * Math.max(1, active.length), reached: progress.filter((p) => p.s === 'atteint').length },
    womenPct: declared.size >= MIN_CELL ? Math.round((women / declared.size) * 100) : null,
    followups: [3, 6, 12, 24, 36].map((m) => ({ months: m, answers: byMonths.get(m) ?? 0 })),
    alumniReporting: last.length,
    employees: publishable(employees, last.length),
    fundsRaised: publishable(funds, last.length),
    revenue: publishable(revenue, last.length),
    stillActivePct: last.length >= MIN_CELL ? Math.round((stillActive / last.length) * 100) : null,
  };
}

export async function partnerReport(orgId: string) {
  const [org] = await db.select().from(crmOrg).where(eq(crmOrg.id, orgId));
  if (!org) return null;
  const deals = await db.select().from(crmDeal).where(and(eq(crmDeal.orgId, orgId), eq(crmDeal.stage, 'gagne')));
  const programmes = [...new Set(deals.map((d) => d.programme).filter((p): p is string => !!p))];
  const eventIds = [...new Set(deals.map((d) => d.eventId).filter((e): e is string => !!e))];
  const events = eventIds.length ? (await allEvents({ hidden: true })).filter((e) => eventIds.includes(e.id)) : [];
  const tickets = eventIds.length ? await db.select({ e: eventTicket.eventId, n: sql<number>`count(*)::int`, inside: sql<number>`count(${eventTicket.checkedInAt})::int` }).from(eventTicket).where(inArray(eventTicket.eventId, eventIds)).groupBy(eventTicket.eventId) : [];
  return {
    org, generatedAt: new Date(),
    deals: deals.map((d) => ({ id: d.id, title: d.title, kind: d.kind, amountXof: d.amountXof, programme: d.programme, event: events.find((e) => e.id === d.eventId)?.t ?? null })),
    committed: deals.reduce((n, d) => n + (d.amountXof ?? 0), 0),
    programmes: await Promise.all(programmes.map((p) => programmeReport(p))),
    events: events.map((e) => ({ title: e.t, date: e.date, city: e.city, tickets: tickets.find((t) => t.e === e.id)?.n ?? 0, attendees: tickets.find((t) => t.e === e.id)?.inside ?? 0 })),
  };
}
