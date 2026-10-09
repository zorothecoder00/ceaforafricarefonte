/* CEA OS — seuils d'approbation (prototype : Processus et seuils), profils dg, ops, it, conf.
   POST { pays, reg, contrat, dg } (FCFA) : valeurs générales (toute l'organisation, tous types) ; chaque seuil dépasse le précédent.
   Les valeurs propres à un type, une région ou un pays se règlent dans Processus et seuils › Seuils (api/admin/os/workflow). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { setSetting } from '../../../../lib/settings';
import { fcfa } from '../../../../lib/os/ref';
import { invalidateWf } from '../../../../lib/os/approvals';

export const prerender = false;

const Body = z.object({ pays: z.coerce.number().int().positive(), reg: z.coerce.number().int().positive(), contrat: z.coerce.number().int().positive(), dg: z.coerce.number().int().positive() });

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, 'dg ops it conf');
  if (c instanceof Response) return c;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Montants invalides.');
  const v = p.data;
  if (v.reg <= v.pays) return fail('Le seuil régional doit être supérieur au seuil pays.');
  if (v.dg <= v.reg) return fail('Le seuil du Bureau panafricain doit être supérieur au seuil régional.');
  await setSetting('seuils', v, locals.user!.id);
  await audit(locals.user!.id, 'os.seuils.modification', 'seuils', { pays: v.pays, reg: v.reg, contrat: v.contrat, dg: v.dg });
  invalidateWf();
  return json({ ok: true, message: `Seuils enregistrés pour toute l'organisation : ${fcfa(v.pays)} / ${fcfa(v.reg)} / ${fcfa(v.contrat)}.` });
};
