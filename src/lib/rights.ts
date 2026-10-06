/* Matrice des droits modifiable (CDC §18) : écarts enregistrés en base (table role_right), chargés par le middleware
   avant chaque requête et appliqués par src/lib/rbac.ts. Cache 30 s par instance, vidé à chaque modification. */
import { db } from './db';
import { roleRight } from '../db/schema/app';
import { ROLES, OBJS, normRights, setRightsOverrides, type RightsOverrides, type Role, type Obj } from './rbac';

let loadedAt = 0;
export async function loadRights(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 30_000) return;
  const rows = await db.select().from(roleRight).catch(() => null);
  if (!rows) return; // base indisponible ou migration absente : matrice par défaut
  const o: RightsOverrides = {};
  for (const r of rows) {
    const v = normRights(r.rights);
    if (v === null || !(ROLES as readonly string[]).includes(r.role) || !OBJS.includes(r.obj as Obj)) continue;
    (o[r.role as Role] ??= {})[r.obj as Obj] = v;
  }
  setRightsOverrides(o);
  loadedAt = Date.now();
}
