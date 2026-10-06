/* Matrice des droits modifiable (CDC §18) : droit paramétrage (M) sur tout le site.
   POST { action: 'set', role, obj, rights }  → droits d'un rôle sur un objet (« » = aucun accès)
   POST { action: 'reset', role, obj }        → valeur par défaut du cahier des charges
   POST { action: 'reset_all' }               → toute la matrice par défaut (droit V) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { roleRight } from '../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApiAll } from '../../../lib/admin';
import { loadRights } from '../../../lib/rights';
import { MATRIX, OBJS, ROLES, ROLE_LABEL, OBJ_LABEL, lockReason, normRights, rightsOf, type Obj, type Role } from '../../../lib/rbac';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), role: z.enum(ROLES), obj: z.enum(OBJS as [Obj, ...Obj[]]), rights: z.string().max(6) }),
  z.object({ action: z.literal('reset'), role: z.enum(ROLES), obj: z.enum(OBJS as [Obj, ...Obj[]]) }),
  z.object({ action: z.literal('reset_all') }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const b = p.data;
  const u = staffApiAll(locals.user, 'parametres', b.action === 'reset_all' ? 'V' : 'M');
  if (u instanceof Response) return u;
  const ip = clientIp(request);

  if (b.action === 'reset_all') {
    const del = await db.delete(roleRight).returning();
    await audit(u.id, 'droits.reinitialisation', 'matrice', { cases: del.map((d) => `${d.role}:${d.obj}=${d.rights}`) }, ip);
    await loadRights(true);
    return json({ ok: true, message: `Matrice du cahier des charges rétablie (${del.length} case${del.length > 1 ? 's' : ''}).` });
  }

  const lock = lockReason(b.role as Role, b.obj);
  if (lock) return fail(lock, 403);
  const before = rightsOf(b.role as Role, b.obj);
  const def = MATRIX[b.role as Role][b.obj] ?? '';
  let after = def;
  if (b.action === 'reset') await db.delete(roleRight).where(and(eq(roleRight.role, b.role), eq(roleRight.obj, b.obj)));
  else {
    const v = normRights(b.rights);
    if (v === null) return fail('Droits invalides : lettres L, C, M, V et « * » facultatif.');
    if (v && !v.includes('L') && v.replace('*', '') !== 'C') return fail('Accordez aussi la lecture (L) : modifier ou valider sans voir est impossible.');
    after = v;
    if (v === def) await db.delete(roleRight).where(and(eq(roleRight.role, b.role), eq(roleRight.obj, b.obj)));
    else await db.insert(roleRight).values({ role: b.role, obj: b.obj, rights: v, updatedBy: u.id })
      .onConflictDoUpdate({ target: [roleRight.role, roleRight.obj], set: { rights: v, updatedBy: u.id, updatedAt: new Date() } });
  }
  await audit(u.id, 'droits.modification', `${b.role}:${b.obj}`, { avant: before, apres: after, defaut: def }, ip);
  await loadRights(true);
  return json({ ok: true, rights: after, changed: after !== def, message: `${ROLE_LABEL[b.role as Role]} · ${OBJ_LABEL[b.obj]} : ${after || 'aucun accès'}.` });
};
