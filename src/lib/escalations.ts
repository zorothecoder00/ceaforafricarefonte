/* Relances et escalades des tickets (CDC §12, workflows : statuts, responsables, délais, relances, escalades).
   Lancé par la tâche planifiée quotidienne : relance le responsable d'un ticket dont l'échéance approche, puis escalade
   (priorité relevée, rôle désigné et adresse facultative prévenus) un ticket en retard. Chaque étape ne survient qu'une fois. */
import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from './db';
import { contactMessage, userRole } from '../db/schema/app';
import { notify } from './notify';
import { sendEmail } from './messaging';
import { getSetting } from './settings';
import { audit } from './session';

const NEXT: Record<string, 'haute' | 'urgente'> = { basse: 'haute', normale: 'haute', haute: 'urgente', urgente: 'urgente' };
const OPEN = ['nouveau', 'en_cours'] as const;

export async function runEscalations(now = new Date()) {
  const cfg = await getSetting('escalade');
  // Relances : échéance dans les N prochaines heures, pas encore relancé
  const soon = await db.select().from(contactMessage).where(and(inArray(contactMessage.status, [...OPEN]), isNotNull(contactMessage.dueAt), isNull(contactMessage.remindedAt),
    lte(contactMessage.dueAt, new Date(now.getTime() + cfg.remindHours * 3600_000))));
  let reminded = 0, escalated = 0;
  const staff = async () => (await db.select({ id: userRole.userId }).from(userRole).where(eq(userRole.role, cfg.role as 'admin'))).map((r) => r.id);
  for (const t of soon) {
    if (t.dueAt! < now) continue; // déjà en retard : traité par l'escalade
    const who = t.assigneeId ? [t.assigneeId] : await staff();
    for (const id of who) await notify(id, `Relance : le ticket ${t.reference} (${t.routedTeam}) arrive à échéance le ${t.dueAt!.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.`, '/admin/messages', { email: true });
    await db.update(contactMessage).set({ remindedAt: now }).where(eq(contactMessage.id, t.id));
    reminded++;
  }
  // Escalades : échéance dépassée depuis plus de N heures, pas encore escaladé
  const late = await db.select().from(contactMessage).where(and(inArray(contactMessage.status, [...OPEN]), isNotNull(contactMessage.dueAt), isNull(contactMessage.escalatedAt),
    lte(contactMessage.dueAt, new Date(now.getTime() - cfg.escalateHours * 3600_000))));
  for (const t of late) {
    const priority = NEXT[t.priority];
    await db.update(contactMessage).set({ escalatedAt: now, priority }).where(eq(contactMessage.id, t.id));
    const text = `Escalade : le ticket ${t.reference} (${t.routedTeam}, « ${t.motif} ») est en retard depuis le ${t.dueAt!.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. Priorité relevée : ${priority}.`;
    for (const id of new Set([...(await staff()), ...(t.assigneeId ? [t.assigneeId] : [])])) await notify(id, text, '/admin/messages', { email: true });
    if (cfg.email) await sendEmail(cfg.email, `[CEA] Ticket en retard : ${t.reference}`, text).catch(() => {});
    await audit(null, 'ticket.escalade', t.reference, { priority, team: t.routedTeam });
    escalated++;
  }
  return { reminded, escalated };
}
