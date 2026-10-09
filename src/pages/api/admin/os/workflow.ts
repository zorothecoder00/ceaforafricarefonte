/* CEA OS — paramétrage du moteur de workflow sans développement (WFL-03, WFL-04) et organes de gouvernance.
   Profils dg, ops, it, conf (Processus et seuils) ; organes : dg, adg, rh, it, conf (Organisation et postes).
   POST { action: 'circuit.save', code, name, escalade, active, steps (texte : « approbateur | conditions | heures » par ligne) } → version + 1
        { action: 'type.save', code, circuit, rejectTo, sla, dueDays, active, checklist (« clé | libellé | * »), exec (« tâche | jours ») }
        { action: 'threshold.set', type ('*' ou code), scope (all, r:AO, p:TG), key (pays, reg, dg, contrat), amount }
        { action: 'threshold.delete', type, scope, key }
        { action: 'organ.add', organ (bp, cc, bii, ci, cs), staffId, role } · { action: 'organ.remove', organ, staffId } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osWfCircuit, osWfType, osWfThreshold, osOrganMember } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { staffById } from '../../../../lib/os/core';
import { invalidateWf, wfConfig } from '../../../../lib/os/approvals';
import { parseChecklistText, parseExecText, parseStepsText } from '../../../../lib/os/workflow-core';
import { ORGANS, PK, REGIONS, fcfa } from '../../../../lib/os/ref';

export const prerender = false;

const Bool = z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean());
const Scope = z.string().refine((s) => s === 'all' || (s.startsWith('r:') && s.slice(2) in REGIONS) || (s.startsWith('p:') && PK.includes(s.slice(2))), 'Portée inconnue.');

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('circuit.save'), code: z.string().min(2).max(20), name: z.string().trim().min(2).max(120), escalade: z.string().trim().max(200).default(''), active: Bool, steps: z.string().max(4000) }),
  z.object({
    action: z.literal('type.save'), code: z.string().min(2).max(30), circuit: z.string().min(2).max(20), rejectTo: z.enum(['clos', 'corrige']), sla: z.coerce.number().int().min(1).max(2160), dueDays: z.coerce.number().int().min(1).max(730), active: Bool,
    checklist: z.string().max(4000).default(''), exec: z.string().max(4000).default(''),
  }),
  z.object({ action: z.literal('threshold.set'), type: z.string().min(1).max(30), scope: Scope, key: z.enum(['pays', 'reg', 'dg', 'contrat']), amount: z.coerce.number().int().positive().max(1e13) }),
  z.object({ action: z.literal('threshold.delete'), type: z.string().min(1).max(30), scope: Scope, key: z.enum(['pays', 'reg', 'dg', 'contrat']) }),
  z.object({ action: z.literal('organ.add'), organ: z.enum(Object.keys(ORGANS) as [string, ...string[]]), staffId: z.string().regex(/^EMP\d{3,6}$/), role: z.string().trim().min(2).max(60).default('Membre') }),
  z.object({ action: z.literal('organ.remove'), organ: z.enum(Object.keys(ORGANS) as [string, ...string[]]), staffId: z.string().regex(/^EMP\d{3,6}$/) }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const raw = await request.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const c = await osApi(locals.user, b.action.startsWith('organ') ? 'dg adg rh it conf' : 'dg ops it conf');
  if (c instanceof Response) return c;
  const uid = locals.user!.id;
  const cfg = await wfConfig();

  if (b.action === 'circuit.save') {
    if (!cfg.circuits.has(b.code)) return fail('Circuit inconnu.', 404);
    const steps = parseStepsText(b.steps);
    if (typeof steps === 'string') return fail(steps);
    if (b.active && !steps.length) return fail('Un circuit actif a au moins une étape.');
    await db.update(osWfCircuit).set({ name: b.name, escalade: b.escalade, active: b.active, steps, version: sql`${osWfCircuit.version} + 1`, updatedBy: uid, updatedAt: new Date() }).where(eq(osWfCircuit.code, b.code));
    await audit(uid, 'os.workflow.circuit', b.code, { etapes: steps.map((s) => s.l + (s.if?.length ? `[${s.if.join('|')}]` : '')).join(' → '), actif: b.active });
    invalidateWf();
    return json({ ok: true, message: `Circuit ${b.code} enregistré (nouvelle version). Il s'applique aux dossiers soumis à partir de maintenant.` });
  }
  if (b.action === 'type.save') {
    if (!cfg.types.has(b.code)) return fail('Type inconnu.', 404);
    if (!cfg.circuits.has(b.circuit)) return fail('Circuit inconnu.');
    const checklist = parseChecklistText(b.checklist), exec = parseExecText(b.exec);
    if (typeof checklist === 'string') return fail(`Pièces — ${checklist}`);
    if (typeof exec === 'string') return fail(`Tâches — ${exec}`);
    await db.update(osWfType).set({ circuit: b.circuit, rejectTo: b.rejectTo, sla: b.sla, dueDays: b.dueDays, active: b.active, checklist, exec, updatedAt: new Date() }).where(eq(osWfType.code, b.code));
    await audit(uid, 'os.workflow.type', b.code, { circuit: b.circuit, pieces: checklist.length, taches: exec.length });
    invalidateWf();
    return json({ ok: true, message: `Type « ${cfg.types.get(b.code)!.label} » enregistré.` });
  }
  if (b.action === 'threshold.set') {
    if (b.type !== '*' && !cfg.types.has(b.type)) return fail('Type inconnu.');
    await db.insert(osWfThreshold).values({ type: b.type, scope: b.scope, key: b.key, amount: b.amount }).onConflictDoUpdate({ target: [osWfThreshold.type, osWfThreshold.scope, osWfThreshold.key], set: { amount: b.amount, updatedAt: new Date() } });
    await audit(uid, 'os.workflow.seuil', `${b.type}/${b.scope}/${b.key}`, { montant: b.amount });
    invalidateWf();
    return json({ ok: true, message: `Seuil ${b.key} enregistré : ${fcfa(b.amount)}.` });
  }
  if (b.action === 'threshold.delete') {
    await db.delete(osWfThreshold).where(and(eq(osWfThreshold.type, b.type), eq(osWfThreshold.scope, b.scope), eq(osWfThreshold.key, b.key)));
    await audit(uid, 'os.workflow.seuil.suppression', `${b.type}/${b.scope}/${b.key}`);
    invalidateWf();
    return json({ ok: true, message: 'Seuil supprimé : la valeur plus générale s’applique.' });
  }
  if (b.action === 'organ.add') {
    const s = await staffById(b.staffId);
    if (!s || !s.active) return fail('Collaborateur inconnu ou inactif.');
    await db.insert(osOrganMember).values({ organ: b.organ, staffId: b.staffId, role: b.role }).onConflictDoUpdate({ target: [osOrganMember.organ, osOrganMember.staffId], set: { role: b.role } });
    await audit(uid, 'os.organe.ajout', b.staffId, { organe: b.organ, role: b.role });
    return json({ ok: true, message: `${s.name} ajouté·e : ${ORGANS[b.organ as keyof typeof ORGANS]}.` });
  }
  await db.delete(osOrganMember).where(and(eq(osOrganMember.organ, b.organ), eq(osOrganMember.staffId, b.staffId)));
  await audit(uid, 'os.organe.retrait', b.staffId, { organe: b.organ });
  return json({ ok: true, message: 'Membre retiré.' });
};
