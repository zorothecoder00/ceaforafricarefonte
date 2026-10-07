/* CEA OS — tâches (prototype › pTaches).
   POST { action: 'create', title, owner, domain, due? } → un manager confie une tâche à son équipe ; sinon à soi-même
   POST { action: 'move', id, status }                   → le responsable de la tâche ou un manager de son périmètre */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osTask } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { allStaff, canUse, MANAGERS } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { TASK_COLS } from '../../../../lib/os/collab';
import { DK, regOf } from '../../../../lib/os/ref';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), title: z.string().trim().min(2, 'Donnez un intitulé.').max(300), owner: z.string().regex(/^EMP\d{3,6}$/), domain: z.enum(DK as [string, ...string[]]), due: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default('') }),
  z.object({ action: z.literal('move'), id: z.uuid(), status: z.enum(TASK_COLS) }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const people = await allStaff();
  const manager = canUse(MANAGERS, c);
  if (b.action === 'create') {
    const w = people.find((s) => s.id === b.owner && s.active);
    const team = w && (w.id === me.id || (manager && (w.managerId === me.id || me.prof === 'dg' || (me.prof === 'dirreg' && regOf(w.country) === me.reg))));
    if (!team) return fail('Vous ne pouvez confier une tâche qu’à vous-même ou à votre équipe.', 403);
    await db.insert(osTask).values({ title: b.title, owner: w.id, country: w.country, domain: b.domain, due: b.due ? new Date(b.due + 'T18:00:00') : new Date(Date.now() + 7 * 864e5), createdBy: me.id });
    if (w.id !== me.id) await notifyStaff([w.id], `Nouvelle tâche de ${me.name} : ${b.title}`, '/admin/taches', people);
    await audit(me.userId, 'os.tache.creation', w.id, { titre: b.title });
    return json({ ok: true, message: 'Tâche créée et notifiée.' });
  }
  const [t] = await db.select().from(osTask).where(eq(osTask.id, b.id));
  if (!t) return fail('Tâche introuvable.', 404);
  const owner = people.find((s) => s.id === t.owner);
  if (t.owner !== me.id && !(manager && (owner?.managerId === me.id || t.createdBy === me.id || me.prof === 'dg'))) return fail('Accès refusé.', 403);
  await db.update(osTask).set({ status: b.status }).where(eq(osTask.id, t.id));
  if (b.status === 'Terminé' && t.owner !== me.id) await notifyStaff([t.owner], `Tâche terminée : ${t.title}`, '/admin/taches', people);
  if (b.status === 'Terminé' && t.createdBy && t.createdBy !== me.id && t.createdBy !== t.owner) await notifyStaff([t.createdBy], `Tâche terminée : ${t.title}`, '/admin/taches', people);
  await audit(me.userId, 'os.tache.statut', t.id, { statut: b.status });
  return json({ ok: true, message: `Tâche : ${b.status}.` });
};
