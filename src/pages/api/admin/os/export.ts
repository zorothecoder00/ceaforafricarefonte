/* CEA OS — exports CSV (séparateur « ; », UTF-8 avec BOM pour Excel).
   GET ?quoi=effectifs (profils dg, rh) · ?quoi=ecritures (profils dg, fin : écritures SYSCOHADA, une ligne par compte)
       ?quoi=paie&m=AAAA-MM (profils dg, rh : livre de paie) */
import type { APIRoute } from 'astro';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osLedger, osPayroll } from '../../../../db/schema/os';
import { fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff } from '../../../../lib/os/core';
import { csvRow } from '../../../../lib/admin';
import { ACCOUNTS } from '../../../../lib/os/ledger';
import { DOM, pn, refT, dstr, type Dom } from '../../../../lib/os/ref';

export const prerender = false;

const SPEC: Record<string, string> = { effectifs: 'dg rh', ecritures: 'dg fin', paie: 'dg rh' };

export const GET: APIRoute = async ({ locals, url }) => {
  const quoi = url.searchParams.get('quoi') ?? '';
  if (!SPEC[quoi]) return fail('Export inconnu.', 404);
  const c = await osApi(locals.user, SPEC[quoi]);
  if (c instanceof Response) return c;
  let rows: unknown[][];
  if (quoi === 'effectifs') {
    const people = await allStaff();
    rows = [['Matricule', 'Nom', 'Poste', 'Grade', 'Pays', 'Département', 'Entrée', 'Salaire brut', 'Actif'], ...people.map((s) => [s.id, s.name, `${s.poste} — ${refT(s.poste)}`, s.grade, pn(s.country), s.department, dstr(s.hireDate), s.salary, s.active ? 'oui' : 'non'])];
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
  const file = quoi === 'ecritures' ? 'ecritures-syscohada' : quoi === 'paie' ? `livre-de-paie-${url.searchParams.get('m')}` : quoi;
  return new Response('﻿' + rows.map(csvRow).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}.csv"`, 'Cache-Control': 'no-store' } });
};
