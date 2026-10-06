/* Projets du Project Studio gérés par l'équipe (CDC §7.2), droits « fiche projet » sur tout le site :
   POST { action: 'create', ownerEmail, name, sector?, country?, stage? }       (C) → { ok, id, redirect }
   POST { action: 'update', id, name, sector?, country?, stage? }               (M)
   POST { action: 'assign', id, officerId }                                       (M) → chargé de programme (« » = aucun)
   POST { action: 'unpublish', id }                                               (M) → retrait du portefeuille public
   POST { action: 'status', id, status, note? }                                   (V) → le porteur est prévenu
   POST { action: 'delete', id, confirm }                                         (V) → confirm = nom du projet */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { project, projectStatusEnum, userRole } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApiAll } from '../../../lib/admin';
import { notify } from '../../../lib/notify';
import { PROJECT_STATUS } from '../../../lib/projects';
import type { Action } from '../../../lib/rbac';
import { COUNTRIES } from '../../../data/site';

export const prerender = false;

const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), t.optional());
const Fields = {
  name: z.string().trim().min(2, 'Nom du projet : 2 caractères minimum.').max(140),
  sector: opt(z.string().trim().max(80)), stage: opt(z.string().trim().max(40)),
  country: opt(z.string().refine((c) => c in COUNTRIES, 'Pays inconnu.')),
};
const id = z.uuid();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), ownerEmail: z.email('Adresse e-mail du porteur invalide.'), ...Fields }),
  z.object({ action: z.literal('update'), id, ...Fields }),
  z.object({ action: z.literal('assign'), id, officerId: z.string().max(64) }),
  z.object({ action: z.literal('unpublish'), id }),
  z.object({ action: z.literal('status'), id, status: z.enum(projectStatusEnum.enumValues), note: opt(z.string().trim().max(1000)) }),
  z.object({ action: z.literal('delete'), id, confirm: z.string().trim().max(140) }),
]);
const NEED: Record<string, Action> = { create: 'C', update: 'M', assign: 'M', unpublish: 'M', status: 'V', delete: 'V' };

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const u = staffApiAll(locals.user, 'fiche_projet', NEED[b.action]);
  if (u instanceof Response) return u;
  const ip = clientIp(request);

  if (b.action === 'create') {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, b.ownerEmail.toLowerCase()));
    if (!owner) return fail('Aucun compte avec cette adresse : créez d’abord le compte du porteur (Membres et rôles).');
    const [row] = await db.insert(project).values({ ownerId: owner.id, name: b.name, sector: b.sector, country: b.country, stage: b.stage, status: 'soumis' }).returning({ id: project.id });
    await db.insert(userRole).values({ userId: owner.id, role: 'entrepreneur' }).onConflictDoNothing();
    await audit(u.id, 'admin.projet.creation', row.id, { porteur: owner.id, nom: b.name }, ip);
    await notify(owner.id, `L'équipe CEA a créé votre projet « ${b.name} » dans le Project Studio.`, `/espace/projets/${row.id}`).catch(() => {});
    return json({ ok: true, id: row.id, message: 'Projet créé.', redirect: `/admin/projets/${row.id}` });
  }

  const [cur] = await db.select().from(project).where(eq(project.id, b.id));
  if (!cur) return fail('Projet introuvable.', 404);

  switch (b.action) {
    case 'update': {
      await db.update(project).set({ name: b.name, sector: b.sector ?? null, country: b.country ?? null, stage: b.stage ?? null, updatedAt: new Date() }).where(eq(project.id, b.id));
      await audit(u.id, 'admin.projet.modification', b.id, { avant: { nom: cur.name, secteur: cur.sector, pays: cur.country, stade: cur.stage }, apres: { nom: b.name, secteur: b.sector, pays: b.country, stade: b.stage } }, ip);
      return json({ ok: true, message: 'Projet mis à jour.' });
    }
    case 'assign': {
      if (b.officerId) {
        const [ok] = await db.select({ id: userRole.userId }).from(userRole).where(and(eq(userRole.userId, b.officerId), eq(userRole.role, 'charge_programme')));
        if (!ok) return fail('Cette personne n’a pas le rôle « Chargé de programme ».');
      }
      await db.update(project).set({ officerId: b.officerId || null, updatedAt: new Date() }).where(eq(project.id, b.id));
      await audit(u.id, 'admin.projet.affectation', b.id, { avant: cur.officerId, apres: b.officerId || null }, ip);
      if (b.officerId && b.officerId !== cur.officerId) await notify(b.officerId, `Le projet « ${cur.name} » vous est confié.`, `/admin/projets/${b.id}`).catch(() => {});
      return json({ ok: true, message: b.officerId ? 'Chargé de programme affecté.' : 'Affectation retirée.' });
    }
    case 'unpublish': {
      await db.update(project).set({ public: false, updatedAt: new Date() }).where(eq(project.id, b.id));
      await audit(u.id, 'admin.projet.retrait_portefeuille', b.id, {}, ip);
      await notify(cur.ownerId, `Votre projet « ${cur.name} » a été retiré du portefeuille public par l'équipe CEA.`, `/espace/projets/${b.id}`).catch(() => {});
      return json({ ok: true, message: 'Projet retiré du portefeuille public.' });
    }
    case 'status': {
      if (b.status === cur.status) return json({ ok: true, message: 'Statut inchangé.' });
      await db.update(project).set({ status: b.status, updatedAt: new Date() }).where(eq(project.id, b.id));
      await audit(u.id, 'admin.projet.statut', b.id, { avant: cur.status, apres: b.status, note: b.note }, ip);
      await notify(cur.ownerId, `Projet « ${cur.name} » : ${PROJECT_STATUS[b.status]}.${b.note ? ' ' + b.note : ''}`, `/espace/projets/${b.id}`).catch(() => {});
      return json({ ok: true, message: `Statut : ${PROJECT_STATUS[b.status]}. Le porteur est prévenu.` });
    }
    case 'delete': {
      if (b.confirm !== cur.name) return fail('Saisissez exactement le nom du projet pour confirmer la suppression.');
      if (cur.dossierId) return fail('Ce projet est relié à un dossier CEA Kapital Invest : archivez-le plutôt.');
      await audit(u.id, 'admin.projet.suppression', b.id, { nom: cur.name, porteur: cur.ownerId }, ip);
      await db.delete(project).where(eq(project.id, b.id));
      await notify(cur.ownerId, `Votre projet « ${cur.name} » a été supprimé par l'équipe CEA.`).catch(() => {});
      return json({ ok: true, message: 'Projet supprimé.', redirect: '/admin/projets' });
    }
  }
};
