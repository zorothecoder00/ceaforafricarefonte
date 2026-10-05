/* Automatisations (CDC §12, workflows) — administration. Droits : objet « automatisations » (§18).
   POST { action: 'save', id?, name, event, conditions, actions, active } | { action: 'delete', id } | { action: 'test', id } (exécution d'essai) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { automation, automationRun } from '../../../db/schema/workflows';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { EVENTS, Conditions, Actions, safeTarget, emit, invalidateAutomations, type EventName } from '../../../lib/automations';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), id: z.uuid().optional(), name: z.string().trim().min(3).max(120), event: z.enum(Object.keys(EVENTS) as [EventName, ...EventName[]]), conditions: Conditions, actions: Actions, active: z.boolean() }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
  z.object({ action: z.literal('test'), id: z.uuid() }),
]);
const SAMPLE: Record<EventName, Record<string, unknown>> = {
  'ticket.cree': { reference: 'TEST-0001', motif: 'Essai', equipe: 'Accueil', pays: 'TG', priorite: 'normale' },
  'formulaire.soumis': { formulaire: 'essai', reference: 'TEST-0001', equipe: 'Accueil', priorite: 'normale', reponse: { message: 'Essai' } },
  'candidature.recue': { reference: 'TEST-0001', programme: 'essai', intitule: 'Programme d’essai' },
  'paiement.reussi': { reference: 'TEST-0001', objet: 'billet', montant: 1000, moyen: 'orange_money' },
};

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', '));
  const b = p.data;
  const u = staffApi(locals.user, 'automatisations', b.action === 'test' ? 'M' : 'V');
  if (u instanceof Response) return u;
  const ip = clientIp(request);
  switch (b.action) {
    case 'save': {
      for (const a of b.actions) if (a.type === 'webhook') { const bad = await safeTarget(a.url); if (bad) return fail(`Webhook refusé : ${bad}.`); }
      const v = { name: b.name, event: b.event, conditions: b.conditions, actions: b.actions, active: b.active };
      if (b.id) await db.update(automation).set(v).where(eq(automation.id, b.id));
      else { const [n] = await db.insert(automation).values({ ...v, secret: randomBytes(24).toString('base64url'), createdBy: u.id }).returning({ id: automation.id }); b.id = n.id; }
      invalidateAutomations();
      await audit(u.id, 'automatisation.enregistrement', b.id, { event: b.event, actions: b.actions.map((a) => a.type) }, ip);
      return json({ ok: true, message: 'Automatisation enregistrée.', redirect: `/admin/automatisations?id=${b.id}` });
    }
    case 'delete': {
      await db.delete(automation).where(eq(automation.id, b.id));
      invalidateAutomations();
      await audit(u.id, 'automatisation.suppression', b.id, {}, ip);
      return json({ ok: true, message: 'Automatisation supprimée.', redirect: '/admin/automatisations' });
    }
    case 'test': {
      // Essai avec des données fictives : les actions sur un ticket (assigner, priorité) échouent faute de ticket réel, c'est attendu
      const [a] = await db.select().from(automation).where(eq(automation.id, b.id));
      if (!a) return fail('Automatisation introuvable.', 404);
      if (!a.active) return fail('Activez l’automatisation pour l’essayer.');
      invalidateAutomations();
      const since = new Date(Date.now() - 5000); // marge : horloges du serveur et de la base
      await emit(a.event as EventName, SAMPLE[a.event as EventName] as never, null);
      const [last] = await db.select().from(automationRun).where(and(eq(automationRun.automationId, a.id), gte(automationRun.at, since))).orderBy(desc(automationRun.at)).limit(1);
      return json({ ok: true, message: last ? `${last.ok ? 'Exécutée' : 'Échec'} : ${last.detail ?? ''}` : 'Conditions non remplies par les données d’essai : rien n’a été exécuté.' });
    }
  }
};
