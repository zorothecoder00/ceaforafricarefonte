/* Rapports (CDC §12, analytique). Droits : objet « rapports » + lecture de l'objet du jeu de données ; portée pays du responsable pays.
   GET ?dataset&by&measure&from&to[&country]&format=csv|xlsx → export du rapport (journalisé)
   POST { action: 'save', name, spec } | { action: 'delete', id } → rapports enregistrés */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { savedReport } from '../../../db/schema/finance';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi, countriesFor, csvRow } from '../../../lib/admin';
import { can } from '../../../lib/rbac';
import { DATASETS, Spec, runReport } from '../../../lib/reports';
import { xlsx, XLSX_TYPE } from '../../../lib/xlsx';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url, request }) => {
  const u = staffApi(locals.user, 'rapports', 'L');
  if (u instanceof Response) return u;
  const p = Spec.safeParse({ ...Object.fromEntries(url.searchParams), country: url.searchParams.get('country') || null });
  if (!p.success) return fail('Rapport invalide.');
  const d = DATASETS[p.data.dataset];
  if (!can(u.roles, d.obj, 'L')) return fail('Vous n’avez pas accès à ces données.', 403);
  const scope = await countriesFor(u, 'rapports', 'L');
  const r = await runReport(p.data, scope);
  const rows = [[d.dims[p.data.by].label, d.measures[p.data.measure].label], ...r.rows.map((x) => [x.k, x.v])];
  await audit(u.id, 'admin.rapport.export', p.data.dataset, { ...p.data, lignes: r.rows.length, format: url.searchParams.get('format') }, clientIp(request));
  const name = `cea-rapport-${p.data.dataset}-${p.data.by}-${p.data.from}-${p.data.to}`;
  if (url.searchParams.get('format') === 'xlsx') return new Response(xlsx(rows, d.label) as BodyInit, { headers: { 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="${name}.xlsx"`, 'Cache-Control': 'no-store' } });
  return new Response('﻿' + rows.map((x) => csvRow(x)).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'Cache-Control': 'no-store' } });
};

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), name: z.string().trim().min(2).max(120), spec: Spec }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
]);
export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const u = staffApi(locals.user, 'rapports', p.data.action === 'save' ? 'C' : 'L');
  if (u instanceof Response) return u;
  if (p.data.action === 'save') {
    if (!can(u.roles, DATASETS[p.data.spec.dataset].obj, 'L')) return fail('Vous n’avez pas accès à ces données.', 403);
    await db.insert(savedReport).values({ name: p.data.name, spec: p.data.spec, createdBy: u.id });
    return json({ ok: true, message: 'Rapport enregistré.' });
  }
  const [r] = await db.select().from(savedReport).where(eq(savedReport.id, p.data.id));
  if (!r) return fail('Rapport introuvable.', 404);
  if (r.createdBy !== u.id && !can(u.roles, 'rapports', 'V')) return fail('Seul son auteur peut supprimer ce rapport.', 403);
  await db.delete(savedReport).where(eq(savedReport.id, r.id));
  return json({ ok: true, message: 'Rapport supprimé.' });
};
