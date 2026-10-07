/* CEA OS — exports CSV (séparateur « ; », UTF-8 avec BOM pour Excel).
   GET ?quoi=effectifs (profils dg, rh) · ?quoi=ecritures (profils dg, fin : écritures SYSCOHADA, une ligne par compte)
       ?quoi=paie&m=AAAA-MM (profils dg, rh : livre de paie) · ?quoi=membres · ?quoi=journal (dg, it, conf : journal d'audit)
       ?quoi=donnees (dg, it : toutes les tables de CEA OS en JSON, réversibilité) */
import type { APIRoute } from 'astro';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osLedger, osPayroll } from '../../../../db/schema/os';
import { auditLog } from '../../../../db/schema/app';
import { user } from '../../../../db/schema/auth';
import { fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff } from '../../../../lib/os/core';
import { csvRow } from '../../../../lib/admin';
import { ACCOUNTS } from '../../../../lib/os/ledger';
import { DK, DOM, PK, pn, refT, dstr, type Dom } from '../../../../lib/os/ref';
import { memberBase } from '../../../../lib/os/relations';

export const prerender = false;

const SPEC: Record<string, string> = { effectifs: 'dg rh', ecritures: 'dg fin', paie: 'dg rh', membres: 'dg dirreg rep agent conf com', journal: 'dg it conf', donnees: 'dg it' };

export const GET: APIRoute = async ({ locals, url }) => {
  const quoi = url.searchParams.get('quoi') ?? '';
  if (!SPEC[quoi]) return fail('Export inconnu.', 404);
  const c = await osApi(locals.user, SPEC[quoi]);
  if (c instanceof Response) return c;
  if (quoi === 'donnees') {
    // Réversibilité : toutes les tables de CEA OS (os_* et personnel) en JSON
    const tables = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and (tablename like 'os\\_%' or tablename = 'staff') order by 1`)).rows as { tablename: string }[];
    const out: Record<string, unknown[]> = {};
    for (const t of tables) out[t.tablename] = (await db.execute(sql.raw(`select * from "${t.tablename}"`))).rows;
    await audit(locals.user!.id, 'os.export', quoi, { tables: tables.length });
    return new Response(JSON.stringify({ export: 'CEA OS', at: new Date().toISOString(), tables: out }, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="cea-os-export.json"', 'Cache-Control': 'no-store' } });
  }
  let rows: unknown[][];
  if (quoi === 'journal') {
    const l = await db.select({ at: auditLog.at, a: auditLog.action, t: auditLog.target, who: user.name }).from(auditLog).leftJoin(user, eq(user.id, auditLog.actorId)).orderBy(desc(auditLog.at)).limit(20000);
    rows = [['Date', 'Utilisateur', 'Action', 'Objet'], ...l.map((x) => [x.at, x.who ?? 'Site web', x.a, x.t ?? ''])];
  } else if (quoi === 'effectifs') {
    const people = await allStaff();
    rows = [['Matricule', 'Nom', 'Poste', 'Grade', 'Pays', 'Département', 'Entrée', 'Salaire brut', 'Actif'], ...people.map((s) => [s.id, s.name, `${s.poste} — ${refT(s.poste)}`, s.grade, pn(s.country), s.department, dstr(s.hireDate), s.salary, s.active ? 'oui' : 'non'])];
  } else if (quoi === 'membres') {
    const base = await memberBase();
    rows = [['Pays', ...DK.map((d) => DOM[d].d), 'Total'], ...PK.map((p) => [pn(p), ...DK.map((d) => base[p]?.[d] ?? 0), DK.reduce((a, d) => a + (base[p]?.[d] ?? 0), 0)])];
  } else if (quoi === 'paie') {
    const m = url.searchParams.get('m') ?? '';
    const [p] = /^\d{4}-\d{2}$/.test(m) ? await db.select().from(osPayroll).where(eq(osPayroll.month, m)) : [];
    if (!p) return fail('Paie introuvable pour ce mois.', 404);
    const people = await allStaff();
    rows = [['Matricule', 'Nom', 'Pays', 'Brut', 'Cotisations', 'Impôt', 'Net', 'Patronal'], ...p.lines.map((l) => [l.id, people.find((s) => s.id === l.id)?.name ?? '', pn(l.country), l.brut, l.cs, l.imp, l.net, l.cp])];
  } else {
    const L = await db.select().from(osLedger).orderBy(asc(osLedger.id));
    rows = [['N°', 'Date', 'Journal', 'Libellé', 'Compte', 'Intitulé', 'Débit', 'Crédit', 'Pays', 'Domaine', 'Pièce'], ...L.flatMap((e) => e.lines.map((x) => ['EC-' + String(e.id).padStart(5, '0'), dstr(e.at), e.journal, e.label, x[0], ACCOUNTS[x[0]] ?? '', x[1], x[2], e.country ? pn(e.country) : '', e.domain && e.domain in DOM ? DOM[e.domain as Dom].n : '', e.ref]))];
  }
  await audit(locals.user!.id, 'os.export', quoi);
  const file = quoi === 'ecritures' ? 'ecritures-syscohada' : quoi === 'paie' ? `livre-de-paie-${url.searchParams.get('m')}` : quoi === 'membres' ? 'membres-pays-domaines' : quoi;
  return new Response('﻿' + rows.map(csvRow).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}.csv"`, 'Cache-Control': 'no-store' } });
};
