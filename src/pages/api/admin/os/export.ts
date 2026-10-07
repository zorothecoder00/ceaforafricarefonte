/* CEA OS — exports CSV (séparateur « ; », UTF-8 avec BOM pour Excel). GET ?quoi=effectifs (profils dg, rh) */
import type { APIRoute } from 'astro';
import { fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff } from '../../../../lib/os/core';
import { csvRow } from '../../../../lib/admin';
import { pn, refT, dstr } from '../../../../lib/os/ref';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const quoi = url.searchParams.get('quoi');
  if (quoi !== 'effectifs') return fail('Export inconnu.', 404);
  const c = await osApi(locals.user, 'dg rh');
  if (c instanceof Response) return c;
  const people = await allStaff();
  const rows = [['Matricule', 'Nom', 'Poste', 'Grade', 'Pays', 'Département', 'Entrée', 'Salaire brut', 'Actif'], ...people.map((s) => [s.id, s.name, `${s.poste} — ${refT(s.poste)}`, s.grade, pn(s.country), s.department, dstr(s.hireDate), s.salary, s.active ? 'oui' : 'non'])];
  await audit(locals.user!.id, 'os.export', quoi);
  return new Response('﻿' + rows.map(csvRow).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${quoi}.csv"`, 'Cache-Control': 'no-store' } });
};
