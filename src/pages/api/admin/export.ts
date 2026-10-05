/* Exports du back-office (CDC §12 : exports CSV et XLSX contrôlés) — chaque export exige son droit et est lui-même journalisé.
   GET ?type=audit|paiements|newsletter|membres|factures|ventes [&format=csv|xlsx] [&du=AAAA-MM-JJ&au=AAAA-MM-JJ]
   « ventes » : journal des ventes au format comptable (SYSCOHADA), une écriture débit client / crédit produit (et TVA) par facture ou avoir. */
import type { APIRoute } from 'astro';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { auditLog, payment, newsletterSubscription, profile, userRole } from '../../../db/schema/app';
import { invoice } from '../../../db/schema/finance';
import { user } from '../../../db/schema/auth';
import { audit, clientIp } from '../../../lib/session';
import { staffApi, countriesFor, csvRow } from '../../../lib/admin';
import { getSetting } from '../../../lib/settings';
import { xlsx, XLSX_TYPE, type Cell } from '../../../lib/xlsx';
import type { Obj } from '../../../lib/rbac';

export const prerender = false;

const RIGHT: Record<string, [Obj, 'L' | 'V']> = { audit: ['journal_audit', 'L'], paiements: ['paiements', 'L'], newsletter: ['contenus', 'V'], membres: ['membres', 'L'], factures: ['paiements', 'L'], ventes: ['paiements', 'L'] };
const day = (s: string | null, end = false) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? '23:59:59' : '00:00:00'}Z`) : null);

export const GET: APIRoute = async ({ locals, url, request }) => {
  const type = url.searchParams.get('type') ?? '';
  if (!RIGHT[type]) return new Response('Export inconnu', { status: 400 });
  const u = staffApi(locals.user, ...RIGHT[type]);
  if (u instanceof Response) return u;
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  const from = day(url.searchParams.get('du')), to = day(url.searchParams.get('au'), true);
  let rows: Cell[][] = [];

  if (type === 'audit') {
    const r = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(50_000);
    rows = [['id', 'date', 'acteur', 'action', 'cible', 'ip', 'détails'], ...r.map((x) => [x.id, x.at, x.actorId, x.action, x.target, x.ip, JSON.stringify(x.meta)])];
  } else if (type === 'paiements') {
    const r = await db.select({ p: payment, email: user.email }).from(payment).leftJoin(user, eq(user.id, payment.userId))
      .where(and(from ? gte(payment.createdAt, from) : undefined, to ? lte(payment.createdAt, to) : undefined)).orderBy(desc(payment.createdAt)).limit(50_000);
    rows = [['référence', 'date', 'e-mail', 'objet', 'montant_xof', 'moyen', 'prestataire', 'statut', 'payé le'], ...r.map(({ p, email }) => [p.reference, p.createdAt, email, p.purpose, p.amountXof, p.method, p.provider, p.status, p.paidAt])];
  } else if (type === 'newsletter') {
    // Seuls les abonnés ayant confirmé (double opt-in) et non désinscrits
    const r = await db.select().from(newsletterSubscription).where(and(isNotNull(newsletterSubscription.confirmedAt), isNull(newsletterSubscription.unsubscribedAt)));
    rows = [['e-mail', 'thèmes', 'pays', 'langue', 'confirmé le'], ...r.map((x) => [x.email, x.topics.join(','), x.country, x.lang, x.confirmedAt])];
  } else if (type === 'membres') {
    const cs = await countriesFor(u, 'membres');
    const r = await db.select({ id: user.id, name: user.name, email: user.email, created: user.createdAt, country: profile.country, sector: profile.sector, roles: sql<string>`(select string_agg(${userRole.role}::text, ',') from ${userRole} where ${userRole.userId} = ${user.id})` })
      .from(user).leftJoin(profile, eq(profile.userId, user.id)).where(cs ? inArray(profile.country, cs.length ? cs : ['--']) : undefined).orderBy(desc(user.createdAt)).limit(50_000);
    rows = [['id', 'nom', 'e-mail', 'inscrit le', 'pays', 'secteur', 'rôles'], ...r.map((x) => [x.id, x.name, x.email, x.created, x.country, x.sector, x.roles])];
  } else {
    const inv = await db.select().from(invoice).where(and(from ? gte(invoice.issuedAt, from) : undefined, to ? lte(invoice.issuedAt, to) : undefined)).orderBy(asc(invoice.issuedAt), asc(invoice.number)).limit(50_000);
    if (type === 'factures') {
      rows = [['numéro', 'type', 'date', 'client', 'société', 'objet', 'HT', 'TVA', 'TTC', 'statut', 'payée le', 'moyen'],
        ...inv.map((f) => { const b = f.buyer as { name?: string; company?: string }; return [f.number, f.kind, f.issuedAt, b.name, b.company, f.purpose, f.totalHtXof, f.taxXof, f.totalXof, f.status, f.paidAt, f.paymentMethod]; })];
    } else {
      // Journal des ventes : facture → débit 411 (TTC) / crédit 70x (HT) / crédit 443 (TVA) ; avoir → écritures inverses
      const acc = await getSetting('comptabilite');
      rows = [['journal', 'date', 'pièce', 'compte', 'libellé', 'débit', 'crédit']];
      // Facture annulée avant paiement : elle et son avoir se compensent exactement ; aucune des deux n'est passée au journal
      const voided = new Set(inv.filter((f) => f.kind === 'facture' && f.status === 'annulee').map((f) => f.id));
      for (const f of inv) {
        if (voided.has(f.id) || (f.originalId && voided.has(f.originalId))) continue;
        const d = f.issuedAt.toISOString().slice(0, 10);
        const b = f.buyer as { name?: string; company?: string };
        const label = `${f.kind === 'avoir' ? 'Avoir' : 'Facture'} ${f.number} — ${b.company || b.name || ''}`.slice(0, 120);
        const product = acc.accounts[f.purpose] ?? acc.accounts.autre ?? '706000';
        const ttc = Math.abs(f.totalXof), ht = Math.abs(f.totalHtXof), tva = Math.abs(f.taxXof);
        const fac = f.kind === 'facture';
        rows.push([acc.journal, d, f.number, acc.client, label, fac ? ttc : 0, fac ? 0 : ttc]);
        rows.push([acc.journal, d, f.number, product, label, fac ? 0 : ht, fac ? ht : 0]);
        if (tva) rows.push([acc.journal, d, f.number, acc.tva, label, fac ? 0 : tva, fac ? tva : 0]);
      }
    }
  }

  await audit(u.id, 'admin.export', type, { lignes: rows.length - 1, format, du: url.searchParams.get('du'), au: url.searchParams.get('au') }, clientIp(request));
  const name = `cea-${type}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'xlsx') return new Response(xlsx(rows, type) as BodyInit, { headers: { 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="${name}.xlsx"`, 'Cache-Control': 'no-store' } });
  return new Response('﻿' + rows.map((r) => csvRow(r.map((c) => (c instanceof Date ? c.toISOString() : c)))).join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'Cache-Control': 'no-store' },
  });
};
