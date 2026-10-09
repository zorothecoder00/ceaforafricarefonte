/* État de l'utilisateur pour l'en-tête des pages statiques : nom, e-mail, rôles, notifications non lues (menu du compte). */
import type { APIRoute } from 'astro';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../../lib/db';
import { notification } from '../../db/schema/app';
import { json } from '../../lib/session';
import { isStaff, ROLE_LABEL, type Role } from '../../lib/rbac';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const u = locals.user;
  if (!u) return json({ ok: true, user: null });
  const [{ n }] = await db.select({ n: count() }).from(notification).where(and(eq(notification.userId, u.id), isNull(notification.readAt)));
  return json({ ok: true, user: { name: u.name, email: u.email, roles: u.roles, roleLabels: u.roles.map((r) => ROLE_LABEL[r as Role] ?? r), staff: isStaff(u.roles) }, unread: n });
};
