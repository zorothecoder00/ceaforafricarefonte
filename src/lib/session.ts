/* Lecture de la session et des rôles de l'utilisateur, et petits utilitaires communs aux routes serveur. */
import { eq } from 'drizzle-orm';
import { auth } from './auth';
import { db } from './db';
import { userRole, auditLog, profile } from '../db/schema/app';
import { can, scope, type Obj, type Action } from './rbac';

export type CurrentUser = { id: string; name: string; email: string; phoneNumber?: string | null; twoFactorEnabled?: boolean | null; roles: string[] };

export async function getCurrentUser(headers: Headers): Promise<CurrentUser | null> {
  const s = await auth.api.getSession({ headers });
  if (!s) return null;
  const [roleRows, [p]] = await Promise.all([
    db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, s.user.id)),
    db.select({ suspendedAt: profile.suspendedAt }).from(profile).where(eq(profile.userId, s.user.id)),
  ]);
  if (p?.suspendedAt) return null; // compte suspendu : traité comme déconnecté
  const roles = roleRows.map((r) => r.role as string);
  const u = s.user as typeof s.user & { phoneNumber?: string | null; twoFactorEnabled?: boolean | null };
  return { id: u.id, name: u.name, email: u.email, phoneNumber: u.phoneNumber, twoFactorEnabled: u.twoFactorEnabled, roles };
}

/** Réponse JSON standard. */
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const fail = (message: string, status = 400) => json({ ok: false, error: message }, status);

/** Garde d'API : utilisateur connecté (et éventuellement autorisé). Renvoie une Response d'erreur ou l'utilisateur. */
export function requireUser(user: CurrentUser | null | undefined): CurrentUser | Response {
  return user ?? fail('Connexion requise.', 401);
}
export function requirePermission(user: CurrentUser | null | undefined, obj: Obj, action: Action): CurrentUser | Response {
  if (!user) return fail('Connexion requise.', 401);
  if (!can(user.roles, obj, action)) return fail('Accès refusé.', 403);
  return user;
}
export { scope };

/** Trace d'audit (journal non modifiable). */
export async function audit(actorId: string | null | undefined, action: string, target?: string, meta: Record<string, unknown> = {}, ip?: string | null) {
  await db.insert(auditLog).values({ actorId: actorId ?? null, action, target, meta, ip: ip ?? null });
}

/** Référence lisible : PREFIXE-2026-XXXXXX */
export const reference = (prefix: string) => `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const clientIp = (request: Request) => request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
