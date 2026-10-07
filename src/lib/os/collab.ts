/* CEA OS — collaboration (prototype : Messagerie, Agenda et réunions, Tâches, registre des décisions).
   Canaux créés à la demande : Général, un par département support, par domaine, par région et par pays doté d'un bureau ;
   messages directs entre deux collaborateurs. Messages non lus : dernier message lu par canal (os_channel_seen). */
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { osChannel, osMessage, osChannelSeen } from '../../db/schema/os';
import type { Person } from './core';
import { DOM, DK, REGIONS, pn, regOf, type Region } from './ref';

export type Channel = typeof osChannel.$inferSelect;

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Crée les canaux d'équipe manquants (idempotent). */
export async function ensureChannels(people: Person[]) {
  const rows: Channel[] = [{ id: 'general', name: "Général — toute l'organisation", scope: '*', createdAt: new Date() }];
  for (const d of DK) rows.push({ id: 'dom_' + d, name: DOM[d].n, scope: 'dom:' + d, createdAt: new Date() });
  for (const r of Object.keys(REGIONS) as Region[]) rows.push({ id: 'reg_' + r, name: 'Région ' + REGIONS[r].n, scope: 'reg:' + r, createdAt: new Date() });
  for (const c of new Set(people.filter((s) => s.prof === 'rep').map((s) => s.country))) rows.push({ id: 'pays_' + c, name: 'Bureau ' + pn(c), scope: 'pays:' + c, createdAt: new Date() });
  for (const dep of new Set(people.filter((s) => !s.domain && s.department && !s.department.startsWith('Bureau')).map((s) => s.department))) rows.push({ id: 'dep_' + slug(dep), name: dep, scope: 'dep:' + dep, createdAt: new Date() });
  await db.insert(osChannel).values(rows).onConflictDoNothing();
}

export function chAllowed(c: Pick<Channel, 'scope'>, me: Person) {
  const s = c.scope;
  if (s === '*') return true;
  const dg = me.prof === 'dg';
  if (s.startsWith('dep:')) return me.department === s.slice(4) || dg;
  if (s.startsWith('dom:')) return me.domain === s.slice(4) || dg;
  if (s.startsWith('reg:')) return regOf(me.country) === s.slice(4) || dg;
  if (s.startsWith('pays:')) return me.country === s.slice(5) || dg;
  if (s.startsWith('dm:')) return s.slice(3).split(',').includes(me.id);
  return false;
}

/** Canaux accessibles, avec le dernier message et le nombre de non lus. */
export async function myChannels(me: Person, people: Person[]) {
  await ensureChannels(people);
  const all = (await db.select().from(osChannel)).filter((c) => chAllowed(c, me));
  if (!all.length) return [];
  const ids = all.map((c) => c.id);
  const [last, seen, counts] = await Promise.all([
    db.execute(sql`select distinct on (channel_id) channel_id, id, staff_id, body, at from os_message where channel_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by channel_id, id desc`),
    db.select().from(osChannelSeen).where(and(eq(osChannelSeen.staffId, me.id), inArray(osChannelSeen.channelId, ids))),
    db.select({ c: osMessage.channelId, n: sql<number>`count(*)::int` }).from(osMessage).groupBy(osMessage.channelId).where(inArray(osMessage.channelId, ids)),
  ]);
  const lastOf = new Map((last.rows as { channel_id: string; id: number; staff_id: string; body: string; at: string }[]).map((r) => [r.channel_id, r]));
  const out = [];
  for (const c of all) {
    const s = seen.find((x) => x.channelId === c.id)?.lastId ?? 0;
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osMessage).where(and(eq(osMessage.channelId, c.id), gt(osMessage.id, s), sql`${osMessage.staffId} <> ${me.id}`));
    out.push({ ...c, last: lastOf.get(c.id) ?? null, unread: n, total: counts.find((x) => x.c === c.id)?.n ?? 0 });
  }
  // Canaux actifs d'abord (dernier message le plus récent), Général en tête
  return out.sort((a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : (b.last ? new Date(b.last.at).getTime() : 0) - (a.last ? new Date(a.last.at).getTime() : 0)));
}

/** Messages non lus (pastille du menu Messagerie). */
export async function unreadCount(me: Person): Promise<number> {
  const r = await db.execute(sql`select c.id, c.scope, coalesce(s.last_id, 0) as seen from os_channel c left join os_channel_seen s on s.channel_id = c.id and s.staff_id = ${me.id}`).catch(() => ({ rows: [] }));
  const chans = (r.rows as { id: string; scope: string; seen: number }[]).filter((c) => chAllowed(c, me));
  if (!chans.length) return 0;
  const q = await db.execute(sql`select count(*)::int as n from os_message m where m.staff_id <> ${me.id} and (${sql.join(chans.map((c) => sql`(m.channel_id = ${c.id} and m.id > ${Number(c.seen)})`), sql` or `)})`);
  return (q.rows[0] as { n: number }).n;
}

export async function markSeen(meId: string, channelId: string) {
  const [l] = await db.select({ id: osMessage.id }).from(osMessage).where(eq(osMessage.channelId, channelId)).orderBy(desc(osMessage.id)).limit(1);
  const lastId = l?.id ?? 0;
  await db.insert(osChannelSeen).values({ staffId: meId, channelId, lastId }).onConflictDoUpdate({ target: [osChannelSeen.staffId, osChannelSeen.channelId], set: { lastId } });
}

/** Canal de message direct entre deux collaborateurs (créé au besoin). */
export async function dmChannel(a: Person, b: Person): Promise<string> {
  const [x, y] = [a.id, b.id].sort();
  const id = `dm_${x}_${y}`;
  await db.insert(osChannel).values({ id, name: `${a.name.split(' ')[0]} ↔ ${b.name}`, scope: `dm:${x},${y}` }).onConflictDoNothing();
  return id;
}

export const TASK_COLS = ['À faire', 'En cours', 'Terminé'] as const;
