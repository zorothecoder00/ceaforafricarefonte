/* CEA OS — paliers d'intégration des 90 premiers jours (prototype › bindOnb) : le collaborateur, son responsable, les RH
   ou la direction cochent un palier. POST { id, i (0..2), checked } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { staff } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { staffById } from '../../../../lib/os/core';

export const prerender = false;

const Body = z.object({ id: z.string().regex(/^EMP\d{3,6}$/), i: z.number().int().min(0).max(2), checked: z.boolean() });

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user);
  if (c instanceof Response) return c;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const s = await staffById(p.data.id);
  if (!s?.onboarding) return fail('Aucun parcours d’intégration pour ce collaborateur.', 404);
  const ok = c.superuser || c.me?.id === s.id || c.me?.id === s.managerId || ['dg', 'rh'].includes(c.prof ?? '');
  if (!ok) return fail('Accès refusé.', 403);
  const onb = [...s.onboarding];
  onb[p.data.i] = p.data.checked;
  await db.update(staff).set({ onboarding: onb, updatedAt: new Date() }).where(eq(staff.id, s.id));
  await audit(locals.user!.id, 'os.integration', s.id, { etape: p.data.i + 1, atteinte: p.data.checked });
  return json({ ok: true, message: p.data.checked ? 'Étape atteinte.' : 'Étape rouverte.' });
};
