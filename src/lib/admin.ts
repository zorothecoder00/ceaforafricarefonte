/* Back-office du site (CDC §11) : gardes d'API selon la matrice des droits (§18) et portée par pays. */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { userRole } from '../db/schema/app';
import { can, scope, needs2fa, type Obj, type Action } from './rbac';
import { fail, type CurrentUser } from './session';

/** Garde d'API du back-office : droit (objet, action) + double authentification pour les rôles sensibles. */
export function staffApi(user: CurrentUser | null | undefined, obj: Obj, action: Action): CurrentUser | Response {
  if (!user) return fail('Connexion requise.', 401);
  if (!can(user.roles, obj, action)) return fail('Accès refusé.', 403);
  if (needs2fa(user.roles) && !user.twoFactorEnabled) return fail('Double authentification requise.', 403);
  return user;
}

/** Garde d'API exigeant le droit sur tous les objets : un droit limité à ses propres données (« * ») ne suffit pas.
    Pour les actions d'équipe sur des objets qui appartiennent à d'autres (ex. statut d'un dossier Kapital). */
export function staffApiAll(user: CurrentUser | null | undefined, obj: Obj, action: Action): CurrentUser | Response {
  const u = staffApi(user, obj, action);
  if (u instanceof Response) return u;
  return scope(u.roles, obj, action) === 'all' ? u : fail('Accès refusé.', 403);
}

/** Pays couverts : null = tous ; tableau = limité (responsable pays, droit « * »). */
export async function countriesFor(user: CurrentUser, obj: Obj, action: Action = 'L'): Promise<string[] | null> {
  const sc = scope(user.roles, obj, action);
  if (sc === 'all') return null;
  const rows = await db.select({ c: userRole.country }).from(userRole).where(and(eq(userRole.userId, user.id), eq(userRole.role, 'responsable_pays'), isNotNull(userRole.country)));
  return rows.map((r) => r.c!);
}

/** Ligne CSV (séparateur « ; » pour Excel en français, guillemets échappés, neutralisation des formules). */
export const csvRow = (cells: unknown[]) => cells.map((c) => {
  let v = c instanceof Date ? c.toISOString() : c == null ? '' : typeof c === 'object' ? JSON.stringify(c) : String(c);
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return `"${v.replace(/"/g, '""')}"`;
}).join(';');
