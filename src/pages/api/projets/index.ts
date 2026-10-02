/* Proposer un projet (CDC §7.2) : formulaire guidé en étapes → projet privé par défaut. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { project, userRole } from '../../../db/schema/app';
import { json, fail, requireUser, audit } from '../../../lib/session';
import { SHEET_FIELDS } from '../../../lib/projects';
import { notify } from '../../../lib/notify';

export const prerender = false;

const txt = z.string().trim().max(5000).optional().default('');
const Body = z.object({
  nom: z.string().trim().min(2).max(140),
  secteur: z.string().trim().max(80).optional(), pays: z.string().length(2).optional(), stade: z.string().max(40).optional(),
  probleme: txt, solution: txt, marche: txt, equipe: txt, modele: txt, traction: txt, besoins: txt, impact: txt,
});

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Indiquez au moins le nom du projet.');
  const sheet = Object.fromEntries(SHEET_FIELDS.map(([k]) => [k, (p.data as Record<string, string>)[k] ?? '']));
  const [row] = await db.insert(project).values({ ownerId: u.id, name: p.data.nom, sector: p.data.secteur, country: p.data.pays, stage: p.data.stade, sheet, status: 'soumis' }).returning({ id: project.id });
  await db.insert(userRole).values({ userId: u.id, role: 'entrepreneur' }).onConflictDoNothing();
  await audit(u.id, 'projet.creation', row.id);
  await notify(u.id, `Projet « ${p.data.nom} » créé. Complétez les outils de conception et le plan d'action.`, `/espace/projets/${row.id}`);
  return json({ ok: true, reference: `PRJ-${row.id.slice(0, 8).toUpperCase()}`, redirect: `/espace/projets/${row.id}` });
};
