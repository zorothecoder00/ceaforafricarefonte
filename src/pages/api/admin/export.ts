/* Exports CSV du back-office : ?type=audit|paiements|newsletter|membres — chaque export est lui-même journalisé. */
import type { APIRoute } from 'astro';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { auditLog, payment, newsletterSubscription, profile, userRole } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { audit, clientIp } from '../../../lib/session';
import { staffApi, countriesFor, csvRow } from '../../../lib/admin';
import type { Obj } from '../../../lib/rbac';

export const prerender = false;

const RIGHT: Record<string, [Obj, 'L' | 'V']> = { audit: ['journal_audit', 'L'], paiements: ['paiements', 'L'], newsletter: ['contenus', 'V'], membres: ['membres', 'L'] };

export const GET: APIRoute = async ({ locals, url, request }) => {
  const type = url.searchParams.get('type') ?? '';
  if (!RIGHT[type]) return new Response('Export inconnu', { status: 400 });
  const u = staffApi(locals.user, ...RIGHT[type]);
  if (u instanceof Response) return u;
  let lines: string[] = [];
  if (type === 'audit') {
    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(50_000);
    lines = [csvRow(['id', 'date', 'acteur', 'action', 'cible', 'ip', 'détails']), ...rows.map((r) => csvRow([r.id, r.at, r.actorId, r.action, r.target, r.ip, r.meta]))];
  } else if (type === 'paiements') {
    const rows = await db.select({ p: payment, email: user.email }).from(payment).leftJoin(user, eq(user.id, payment.userId)).orderBy(desc(payment.createdAt)).limit(50_000);
    lines = [csvRow(['référence', 'date', 'e-mail', 'objet', 'montant_xof', 'moyen', 'prestataire', 'statut', 'payé le']), ...rows.map(({ p, email }) => csvRow([p.reference, p.createdAt, email, p.purpose, p.amountXof, p.method, p.provider, p.status, p.paidAt]))];
  } else if (type === 'newsletter') {
    // Seuls les abonnés ayant confirmé (double opt-in) et non désinscrits
    const rows = await db.select().from(newsletterSubscription).where(and(isNotNull(newsletterSubscription.confirmedAt), isNull(newsletterSubscription.unsubscribedAt)));
    lines = [csvRow(['e-mail', 'thèmes', 'pays', 'langue', 'confirmé le']), ...rows.map((r) => csvRow([r.email, r.topics.join(','), r.country, r.lang, r.confirmedAt]))];
  } else {
    const cs = await countriesFor(u, 'membres');
    const rows = await db.select({ id: user.id, name: user.name, email: user.email, created: user.createdAt, country: profile.country, sector: profile.sector, roles: sql<string>`(select string_agg(${userRole.role}::text, ',') from ${userRole} where ${userRole.userId} = ${user.id})` })
      .from(user).leftJoin(profile, eq(profile.userId, user.id)).where(cs ? inArray(profile.country, cs.length ? cs : ['--']) : undefined).orderBy(desc(user.createdAt)).limit(50_000);
    lines = [csvRow(['id', 'nom', 'e-mail', 'inscrit le', 'pays', 'secteur', 'rôles']), ...rows.map((r) => csvRow([r.id, r.name, r.email, r.created, r.country, r.sector, r.roles]))];
  }
  await audit(u.id, 'admin.export', type, { lignes: lines.length - 1 }, clientIp(request));
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cea-${type}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
  });
};
