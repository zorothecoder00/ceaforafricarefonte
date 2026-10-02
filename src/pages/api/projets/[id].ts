/* Espace de travail d'un projet (CDC §7.2). PUT : fiche, maturité, modèle financier, publication, statut.
   POST { action } : 'canvas', 'tache', 'commentaire', 'competence', 'membre', 'kapital'. PATCH : tâche. DELETE : tâche. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, max } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { project, projectCanvas, projectTask, projectComment, projectMember, skillCall, canvasKindEnum } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { dossier, dossierEvent } from '../../../db/schema/kapital';
import { json, fail, requireUser, audit, reference } from '../../../lib/session';
import { projectRole, canEdit, canComment, SHEET_FIELDS, maturityScore } from '../../../lib/projects';
import { notify } from '../../../lib/notify';

export const prerender = false;

const n = z.coerce.number().finite();
const PutBody = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  sheet: z.record(z.string(), z.string().max(5000)).optional(),
  maturity: z.record(z.string(), z.coerce.number().int().min(0).max(5)).optional(),
  finance: z.object({ ca: n, croissance: n, marge: n, chargesMensuelles: n, investissement: n, tresorerieInitiale: n, bfrJours: n }).optional(),
  public: z.boolean().optional(),
});

export const PUT: APIRoute = async ({ locals, request, params }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const id = params.id!;
  const role = await projectRole(u, id);
  if (!canEdit(role)) return fail('Accès refusé.', 403);
  const p = PutBody.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [cur] = await db.select().from(project).where(eq(project.id, id));
  const set: Partial<typeof project.$inferInsert> = { updatedAt: new Date() };
  if (p.data.name) set.name = p.data.name;
  if (p.data.sheet) set.sheet = { ...(cur.sheet as object), ...Object.fromEntries(Object.entries(p.data.sheet).filter(([k]) => SHEET_FIELDS.some(([f]) => f === k))) };
  if (p.data.maturity) {
    set.maturity = p.data.maturity;
    if (maturityScore(p.data.maturity) >= 70 && cur.status === 'en_structuration') set.status = 'pret_investissement';
  }
  if (p.data.finance) set.finance = p.data.finance;
  if (p.data.public !== undefined) {
    if (role !== 'proprietaire') return fail('Seul le porteur peut publier le projet.', 403);
    set.public = p.data.public; // accord explicite du porteur (CDC §7.2 garde-fous)
  }
  if (cur.status === 'soumis') set.status = 'en_structuration';
  await db.update(project).set(set).where(eq(project.id, id));
  return json({ ok: true, message: 'Enregistré.' });
};

const PostBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('canvas'), kind: z.enum(canvasKindEnum.enumValues), data: z.record(z.string(), z.string().max(3000)) }),
  z.object({ action: z.literal('tache'), title: z.string().trim().min(2).max(200), owner: z.string().max(80).optional(), startOn: z.string().optional(), dueOn: z.string().optional(), milestone: z.boolean().default(false), budgetXof: z.coerce.number().int().min(0).optional() }),
  z.object({ action: z.literal('commentaire'), section: z.string().max(40).optional(), body: z.string().trim().min(2).max(3000) }),
  z.object({ action: z.literal('competence'), need: z.string().trim().min(3).max(200), kind: z.enum(['associe', 'expert', 'prestataire']).default('expert') }),
  z.object({ action: z.literal('membre'), email: z.email(), role: z.enum(['membre', 'expert', 'partenaire']).default('membre') }),
  z.object({ action: z.literal('kapital') }),
]);

export const POST: APIRoute = async ({ locals, request, params }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const id = params.id!;
  const role = await projectRole(u, id);
  if (!role) return fail('Accès refusé.', 403);
  const p = PostBody.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const [prj] = await db.select().from(project).where(eq(project.id, id));
  const b = p.data;
  switch (b.action) {
    case 'canvas': {
      if (!canEdit(role)) return fail('Accès refusé.', 403);
      const [{ v }] = await db.select({ v: max(projectCanvas.version) }).from(projectCanvas).where(and(eq(projectCanvas.projectId, id), eq(projectCanvas.kind, b.kind)));
      await db.insert(projectCanvas).values({ projectId: id, kind: b.kind, data: b.data, version: (v ?? 0) + 1, savedBy: u.id });
      return json({ ok: true, message: `Version ${(v ?? 0) + 1} enregistrée.` });
    }
    case 'tache':
      if (!canEdit(role)) return fail('Accès refusé.', 403);
      await db.insert(projectTask).values({ projectId: id, title: b.title, owner: b.owner, startOn: b.startOn || null, dueOn: b.dueOn || null, milestone: b.milestone, budgetXof: b.budgetXof });
      return json({ ok: true, message: 'Tâche ajoutée.' });
    case 'commentaire':
      if (!canComment(role)) return fail('Accès refusé.', 403);
      await db.insert(projectComment).values({ projectId: id, authorId: u.id, section: b.section, body: b.body });
      if (prj.ownerId !== u.id) await notify(prj.ownerId, `Nouveau commentaire sur « ${prj.name} »`, `/espace/projets/${id}`);
      return json({ ok: true, message: 'Commentaire publié.' });
    case 'competence':
      if (!canEdit(role)) return fail('Accès refusé.', 403);
      await db.insert(skillCall).values({ projectId: id, need: b.need, kind: b.kind });
      return json({ ok: true, message: 'Appel à compétences publié.' });
    case 'membre': {
      if (role !== 'proprietaire') return fail('Seul le porteur peut inviter.', 403);
      const [m] = await db.select({ id: user.id }).from(user).where(eq(user.email, b.email.toLowerCase()));
      if (!m) return fail('Aucun membre avec cet e-mail.');
      await db.insert(projectMember).values({ projectId: id, userId: m.id, role: b.role }).onConflictDoUpdate({ target: [projectMember.projectId, projectMember.userId], set: { role: b.role } });
      await notify(m.id, `Vous avez été ajouté au projet « ${prj.name} »`, `/espace/projets/${id}`);
      return json({ ok: true, message: 'Membre ajouté.' });
    }
    case 'kapital': {
      // Passerelle vers CEA KAPITAL INVEST quand le projet est prêt (CDC §7.2)
      if (role !== 'proprietaire') return fail('Seul le porteur peut transmettre le projet.', 403);
      if (prj.dossierId) return json({ ok: true, message: 'Déjà transmis.', redirect: '/kapital/entreprise' });
      if (maturityScore(prj.maturity as Record<string, number>) < 60) return fail('Score de maturité insuffisant (60/100 minimum) : complétez d’abord la structuration.');
      const sheet = prj.sheet as Record<string, string>;
      const ref = reference('D');
      const [d] = await db.insert(dossier).values({ reference: ref, ownerId: u.id, companyName: prj.name, country: prj.country ?? 'TG', sector: prj.sector, stage: prj.stage, useOfFunds: sheet.besoins, traction: sheet.traction, team: sheet.equipe, investorReadyScore: maturityScore(prj.maturity as Record<string, number>) }).returning({ id: dossier.id });
      await db.insert(dossierEvent).values({ dossierId: d.id, toStatus: 'recu', actorId: u.id, note: 'Transmis depuis Project Studio' });
      await db.update(project).set({ dossierId: d.id, status: 'transmis_kapital', updatedAt: new Date() }).where(eq(project.id, id));
      await audit(u.id, 'projet.transmission_kapital', ref, { project: id });
      return json({ ok: true, message: `Dossier ${ref} créé dans Kapital Invest.`, redirect: '/kapital/entreprise' });
    }
  }
};

export const PATCH: APIRoute = async ({ locals, request, params }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  if (!canEdit(await projectRole(u, params.id!))) return fail('Accès refusé.', 403);
  const p = z.object({ taskId: z.uuid(), status: z.enum(['a_faire', 'en_cours', 'termine']).optional(), spentXof: z.coerce.number().int().min(0).optional() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  const { taskId, ...set } = p.data;
  await db.update(projectTask).set(set).where(and(eq(projectTask.id, taskId), eq(projectTask.projectId, params.id!)));
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ locals, request, params }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  if (!canEdit(await projectRole(u, params.id!))) return fail('Accès refusé.', 403);
  const p = z.object({ taskId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Données invalides.');
  await db.delete(projectTask).where(and(eq(projectTask.id, p.data.taskId), eq(projectTask.projectId, params.id!)));
  return json({ ok: true, message: 'Tâche supprimée.' });
};
