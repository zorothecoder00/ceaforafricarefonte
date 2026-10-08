/* Prévision de fréquentation et alertes de surréservation (CDC §7.3).
   - Inscriptions prévues le jour J : billets vendus + rythme des 14 derniers jours × jours restants (plafonné à la jauge,
     puisque la billetterie refuse au-delà) ; la demande non servie apparaît dans la liste d'attente.
   - Présence attendue : inscriptions × taux de présence observé sur les événements passés (billets scannés à l'entrée),
     80 % par défaut tant que l'historique compte moins de 50 billets.
   - Alertes : « complet prévu » quand la demande projetée atteint la jauge avant la date ; « surréservation » quand la demande
     (inscrits + projection + liste d'attente) dépasse la jauge de plus de 10 % : prévoir une plus grande salle, une diffusion
     en ligne ou une ouverture de places calculée sur le taux d'absence. */
import { and, count, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { eventTicket, eventWaitlist, eventAlert, userRole } from '../db/schema/app';
import { allEvents, type EventFull } from './catalog';
import { ROLES, can } from './rbac';
import { notify } from './notify';

const DAY = 86_400_000;
export const DEFAULT_SHOW_RATE = 0.8;
const MIN_HISTORY = 50;

export type Forecast = {
  sold: number; capacity: number | null; waitlist: number; daysLeft: number; perDay: number;
  projected: number; demand: number; showRate: number; showRateSource: 'historique' | 'defaut';
  expected: number; fullOn: string | null; extraSeats: number;
  level: 'ok' | 'complet_prevu' | 'surreservation' | 'complet';
};

/** Calcul pur : `sales` = dates de création des billets valides (ou utilisés) ; `date` = jour de l'événement (AAAA-MM-JJ). */
export function forecast(o: { date: string; capacity: number | null; sales: Date[]; waitlist: number; showRate: number | null; now?: Date }): Forecast {
  const now = o.now ?? new Date();
  const start = Date.parse(`${o.date}T00:00:00Z`);
  const daysLeft = Math.max(0, Math.ceil((start - now.getTime()) / DAY));
  const sold = o.sales.length;
  const recent = o.sales.filter((d) => d.getTime() > now.getTime() - 14 * DAY).length;
  const perDay = Math.round((recent / 14) * 10) / 10;
  const rawProjected = Math.round(sold + perDay * daysLeft);
  const cap = o.capacity && Number.isFinite(o.capacity) ? o.capacity : null;
  const projected = cap ? Math.min(cap, rawProjected) : rawProjected;
  const demand = rawProjected + o.waitlist;
  const showRate = o.showRate ?? DEFAULT_SHOW_RATE;
  const expected = Math.round(projected * showRate);
  let fullOn: string | null = null;
  if (cap && sold < cap && perDay > 0) {
    const d = Math.ceil((cap - sold) / perDay);
    if (d <= daysLeft) fullOn = new Date(now.getTime() + d * DAY).toISOString().slice(0, 10);
  }
  // Places qu'on pourrait ouvrir au-delà de la jauge sans dépasser la salle, d'après le taux d'absence observé
  const extraSeats = cap && o.showRate != null ? Math.max(0, Math.floor(cap / showRate) - cap) : 0;
  const level: Forecast['level'] = !cap ? 'ok'
    : demand > cap * 1.1 ? 'surreservation'
    : sold >= cap ? 'complet'
    : fullOn ? 'complet_prevu' : 'ok';
  return { sold, capacity: cap, waitlist: o.waitlist, daysLeft, perDay, projected, demand, showRate, showRateSource: o.showRate == null ? 'defaut' : 'historique', expected, fullOn, extraSeats, level };
}

/** Taux de présence observé sur les événements passés (billets scannés / billets émis), ou null si l'historique est trop court. */
export async function historicShowRate(now = new Date()): Promise<number | null> {
  const past = (await allEvents({ hidden: true })).filter((e) => e.date < now.toISOString().slice(0, 10)).map((e) => e.id);
  if (!past.length) return null;
  const live = and(inArray(eventTicket.eventId, past), inArray(eventTicket.status, ['valide', 'utilise']));
  const [{ n }] = await db.select({ n: count() }).from(eventTicket).where(live);
  if (n < MIN_HISTORY) return null;
  const [{ p }] = await db.select({ p: count() }).from(eventTicket).where(and(live, isNotNull(eventTicket.checkedInAt)));
  return Math.round((p / n) * 100) / 100;
}

/** Prévision d'un événement à partir de la base. */
export async function eventForecast(e: EventFull, showRate?: number | null, now = new Date()) {
  const [sales, [{ w }]] = await Promise.all([
    db.select({ at: eventTicket.createdAt }).from(eventTicket).where(and(eq(eventTicket.eventId, e.id), inArray(eventTicket.status, ['valide', 'utilise']))),
    db.select({ w: count() }).from(eventWaitlist).where(and(eq(eventWaitlist.eventId, e.id), sql`${eventWaitlist.notifiedAt} is null`)),
  ]);
  return forecast({ date: e.date, capacity: e.capacity, sales: sales.map((x) => x.at), waitlist: w, showRate: showRate === undefined ? await historicShowRate(now) : showRate, now });
}

export const LEVEL_LABEL: Record<Forecast['level'], string> = { ok: 'Normal', complet_prevu: 'Complet prévu', surreservation: 'Surréservation', complet: 'Complet' };

/** Alerte l'équipe (droit de contrôle d'accès) une fois par événement et par type d'alerte — appelé chaque jour par le cron. */
export async function sendForecastAlerts(now = new Date()) {
  const today = now.toISOString().slice(0, 10), horizon = new Date(now.getTime() + 60 * DAY).toISOString().slice(0, 10);
  const events = (await allEvents({ hidden: true })).filter((e) => e.date >= today && e.date <= horizon && e.capacity);
  if (!events.length) return 0;
  const rate = await historicShowRate(now);
  const roles = ROLES.filter((r) => can([r], 'controle_acces', 'V'));
  const staff = roles.length ? await db.selectDistinct({ id: userRole.userId }).from(userRole).where(inArray(userRole.role, roles)) : [];
  let sent = 0;
  for (const e of events) {
    const f = await eventForecast(e, rate, now);
    if (f.level !== 'complet_prevu' && f.level !== 'surreservation') continue;
    const [fresh] = await db.insert(eventAlert).values({ eventId: e.id, kind: f.level }).onConflictDoNothing().returning();
    if (!fresh) continue;
    const text = f.level === 'surreservation'
      ? `Surréservation : « ${e.t} » — demande estimée ${f.demand} pour ${f.capacity} places (dont ${f.waitlist} en liste d'attente). Prévoir une plus grande salle, une diffusion en ligne${f.extraSeats ? ` ou ${f.extraSeats} places de plus d'après le taux d'absence` : ''}.`
      : `Complet prévu le ${new Date(`${f.fullOn}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} : « ${e.t} » (${f.sold}/${f.capacity} places, ${f.perDay} inscriptions par jour).`;
    for (const s of staff) await notify(s.id, text, `/admin/evenement/${e.id}`);
    sent++;
  }
  return sent;
}

// Utilisé par l'écran de l'événement : billets émis par jour, sur les 30 derniers jours
export async function salesByDay(eventId: string, now = new Date()) {
  const from = new Date(now.getTime() - 30 * DAY);
  const rows = await db.select({ d: sql<string>`to_char(${eventTicket.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`, n: count() }).from(eventTicket)
    .where(and(eq(eventTicket.eventId, eventId), inArray(eventTicket.status, ['valide', 'utilise']), gte(eventTicket.createdAt, from), lt(eventTicket.createdAt, now)))
    .groupBy(sql`1`);
  return Object.fromEntries(rows.map((r) => [r.d, r.n]));
}
