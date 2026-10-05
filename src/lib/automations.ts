/* Workflows et automatisations (CDC §12, « déclencheurs type Zapier intégré ») : un événement de la plateforme, des conditions sur
   ses données, des actions. emit() ne lève jamais d'erreur : une automatisation en échec ne bloque pas l'action de l'utilisateur ;
   chaque exécution est journalisée (automation_run).
   Webhooks : HTTPS uniquement, adresses internes refusées (résolution DNS vérifiée), redirections non suivies, corps signé (HMAC-SHA256). */
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { automation, automationRun } from '../db/schema/workflows';
import { contactMessage, userRole } from '../db/schema/app';
import { user } from '../db/schema/auth';
import { notify } from './notify';
import { sendEmail } from './messaging';
import { ROLES } from './rbac';

/** Événements disponibles et champs de leurs données (pour les conditions et la documentation). */
export const EVENTS = {
  'ticket.cree': { label: 'Demande ou ticket créé (contact, formulaires)', fields: ['reference', 'motif', 'equipe', 'pays', 'priorite'] },
  'formulaire.soumis': { label: 'Formulaire soumis', fields: ['formulaire', 'reference', 'equipe', 'priorite', 'reponse.<champ>'] },
  'candidature.recue': { label: 'Candidature reçue', fields: ['reference', 'programme', 'intitule'] },
  'paiement.reussi': { label: 'Paiement réussi', fields: ['reference', 'objet', 'montant', 'moyen'] },
} as const;
export type EventName = keyof typeof EVENTS;

export const Condition = z.object({ field: z.string().trim().min(1).max(60), op: z.enum(['egal', 'different', 'contient', 'existe', 'superieur']), value: z.string().max(200).default('') });
export const Action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('notifier_role'), role: z.enum(ROLES), message: z.string().trim().max(300).default('') }),
  z.object({ type: z.literal('email'), to: z.email(), subject: z.string().trim().max(160).default('') }),
  z.object({ type: z.literal('assigner'), email: z.email() }),
  z.object({ type: z.literal('priorite'), value: z.enum(['basse', 'normale', 'haute', 'urgente']) }),
  z.object({ type: z.literal('webhook'), url: z.url().max(500).refine((u) => u.startsWith('https://'), 'HTTPS obligatoire') }),
]);
export const Conditions = z.array(Condition).max(10);
export const Actions = z.array(Action).min(1, 'Au moins une action').max(10);
export type Payload = Record<string, string | number | boolean | null | Record<string, string>>;

/** Valeur d'un champ de données, « reponse.secteur » compris. */
const read = (p: Payload, field: string) => field.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), p);
export function matches(conds: z.infer<typeof Conditions>, p: Payload) {
  return conds.every((c) => {
    const v = read(p, c.field);
    const s = v == null ? '' : String(v);
    switch (c.op) {
      case 'egal': return s.toLowerCase() === c.value.toLowerCase();
      case 'different': return s.toLowerCase() !== c.value.toLowerCase();
      case 'contient': return s.toLowerCase().includes(c.value.toLowerCase());
      case 'existe': return s !== '';
      case 'superieur': return Number(s) > Number(c.value);
    }
  });
}

/* ----- Garde-fou des webhooks : pas d'appel vers le réseau interne ----- */
export function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || (x.startsWith('::ffff:') && privateIp(x.slice(7)));
}
export async function safeTarget(url: string) {
  let u: URL;
  try { u = new URL(url); } catch { return 'Adresse invalide'; }
  if (u.protocol !== 'https:') return 'HTTPS obligatoire';
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) return 'Adresse interne refusée';
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) return 'Nom de domaine introuvable';
  if (addrs.some((a) => privateIp(a.address))) return 'Adresse interne refusée';
  return null;
}
export const sign = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

type Auto = typeof automation.$inferSelect;
async function run(a: Auto, event: EventName, subject: string | null, p: Payload) {
  const done: string[] = [];
  for (const raw of a.actions as unknown[]) {
    const act = Action.parse(raw);
    switch (act.type) {
      case 'notifier_role': {
        const staff = await db.select({ id: userRole.userId }).from(userRole).where(eq(userRole.role, act.role));
        for (const s of staff) await notify(s.id, `${a.name} : ${act.message || EVENTS[event].label}${subject ? ` (${subject})` : ''}`, subject?.match(/^[A-Z]+-/) ? '/admin/messages' : '/admin', { email: true });
        done.push(`${staff.length} notification(s) ${act.role}`);
        break;
      }
      case 'email': {
        const lines = Object.entries(p).map(([k, v]) => `${k} : ${typeof v === 'object' && v ? JSON.stringify(v) : v ?? ''}`).join('\n');
        await sendEmail(act.to, act.subject || `[CEA] ${a.name}${subject ? ` — ${subject}` : ''}`, `${EVENTS[event].label}\n\n${lines}`);
        done.push(`e-mail ${act.to}`);
        break;
      }
      case 'assigner':
      case 'priorite': {
        if (!subject) throw new Error('Action réservée aux tickets');
        if (act.type === 'priorite') await db.update(contactMessage).set({ priority: act.value }).where(eq(contactMessage.reference, subject));
        else {
          const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, act.email.toLowerCase()));
          if (!u) throw new Error(`Aucun compte ${act.email}`);
          await db.update(contactMessage).set({ assigneeId: u.id }).where(eq(contactMessage.reference, subject));
          await notify(u.id, `Ticket ${subject} assigné automatiquement (${a.name})`, '/admin/messages');
        }
        done.push(act.type === 'priorite' ? `priorité ${act.value}` : `assigné à ${act.email}`);
        break;
      }
      case 'webhook': {
        const bad = await safeTarget(act.url);
        if (bad) throw new Error(`Webhook refusé : ${bad}`);
        const body = JSON.stringify({ event, subject, data: p, at: new Date().toISOString() });
        const res = await fetch(act.url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json', 'X-CEA-Event': event, 'X-CEA-Signature': sign(a.secret, body) }, body });
        if (!res.ok) throw new Error(`Webhook : réponse ${res.status}`);
        done.push(`webhook ${res.status}`);
        break;
      }
    }
  }
  return done.join(' · ');
}

let cache: { at: number; list: Auto[] } | undefined;
export const invalidateAutomations = () => { cache = undefined; };

/** Déclenche les automatisations actives de l'événement dont les conditions sont vérifiées. Ne lève jamais d'erreur. */
export async function emit(event: EventName, p: Payload, subject: string | null = null) {
  try {
    if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), list: await db.select().from(automation).where(eq(automation.active, true)) };
    for (const a of cache.list.filter((x) => x.event === event)) {
      if (!matches(Conditions.parse(a.conditions), p)) continue;
      try {
        const detail = await run(a, event, subject, p);
        await db.insert(automationRun).values({ automationId: a.id, event, subject, ok: true, detail });
      } catch (e) {
        await db.insert(automationRun).values({ automationId: a.id, event, subject, ok: false, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[automatisations]', e instanceof Error ? e.message : e);
  }
}
