/* CEA OS — saisie des temps de la semaine en cours (prototype : Mes temps).
   POST { domain, project, hours } → au plus 60 h dans la semaine. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osTimesheet } from '../../../../db/schema/os';
import { json, fail } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { DK, weekKey } from '../../../../lib/os/ref';

export const prerender = false;

const Body = z.object({
  domain: z.enum(DK as [string, ...string[]], { message: 'Domaine inconnu.' }),
  project: z.string().trim().min(2).max(160),
  hours: z.coerce.number().min(0.5, 'Indiquez un nombre d’heures.').max(60),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const week = weekKey();
  const [{ h }] = await db.select({ h: sql<number>`coalesce(sum(${osTimesheet.hours}),0)::float` }).from(osTimesheet).where(and(eq(osTimesheet.staffId, me.id), eq(osTimesheet.week, week)));
  if (h + p.data.hours > 60) return fail('Plus de 60 h dans la semaine : vérifiez votre saisie.');
  await db.insert(osTimesheet).values({ staffId: me.id, week, ...p.data });
  return json({ ok: true, message: 'Temps enregistré.' });
};
