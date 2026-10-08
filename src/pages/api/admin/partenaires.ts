/* Espace Partenaire, côté équipe (droit M sur « crm », double authentification).
   POST { action: 'acces', orgId, email }                      → ouvre le tableau de bord de l'organisation à ce compte (rôle partenaire)
   POST { action: 'retirer', orgId, userId }                   → ferme cet accès
   POST { action: 'livrable', dealId, title, dueOn?, note? }   → ajoute un livrable à une convention
   POST { action: 'statut', id, status, link?, note? }         → fait avancer un livrable (« livré » prévient le partenaire) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { crmDeal, crmOrg, partnerAccess, partnerDeliverable } from '../../../db/schema/crm';
import { userRole } from '../../../db/schema/app';
import { user } from '../../../db/schema/auth';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { notify } from '../../../lib/notify';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('acces'), orgId: z.uuid(), email: z.email() }),
  z.object({ action: z.literal('retirer'), orgId: z.uuid(), userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('livrable'), dealId: z.uuid(), title: z.string().trim().min(3).max(160), dueOn: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('statut'), id: z.uuid(), status: z.enum(['a_faire', 'en_cours', 'livre']), link: z.union([z.literal(''), z.url().max(500)]).optional(), note: z.string().trim().max(1000).optional() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = staffApi(locals.user, 'crm', 'M');
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.path[0] === 'link' ? 'Lien invalide (adresse complète en https://).' : 'Données invalides.');
  const b = p.data, ip = clientIp(request);
  switch (b.action) {
    case 'acces': {
      const [org] = await db.select({ name: crmOrg.name }).from(crmOrg).where(eq(crmOrg.id, b.orgId));
      if (!org) return fail('Organisation introuvable.', 404);
      const [who] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(sql`lower(${user.email})`, b.email.toLowerCase()));
      if (!who) return fail('Aucun compte avec cet e-mail : la personne doit d’abord créer un compte membre.', 404);
      await db.insert(partnerAccess).values({ userId: who.id, orgId: b.orgId, createdBy: u.id }).onConflictDoNothing();
      await db.insert(userRole).values({ userId: who.id, role: 'partenaire' }).onConflictDoNothing();
      await audit(u.id, 'partenaire.acces', b.orgId, { compte: who.id }, ip);
      await notify(who.id, `Votre espace partenaire ${org.name} est ouvert : conventions, programmes cofinancés, livrables et indicateurs.`, '/espace/partenaire', { email: true });
      return json({ ok: true, message: `Espace partenaire ouvert à ${who.name}.` });
    }
    case 'retirer': {
      await db.delete(partnerAccess).where(and(eq(partnerAccess.orgId, b.orgId), eq(partnerAccess.userId, b.userId)));
      const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(partnerAccess).where(eq(partnerAccess.userId, b.userId));
      if (!left.n) await db.delete(userRole).where(and(eq(userRole.userId, b.userId), eq(userRole.role, 'partenaire')));
      await audit(u.id, 'partenaire.retrait', b.orgId, { compte: b.userId }, ip);
      return json({ ok: true, message: 'Accès retiré.' });
    }
    case 'livrable': {
      const [d] = await db.select({ id: crmDeal.id, stage: crmDeal.stage }).from(crmDeal).where(eq(crmDeal.id, b.dealId));
      if (!d) return fail('Convention introuvable.', 404);
      if (d.stage !== 'gagne') return fail('Les livrables se rattachent à une convention conclue (opportunité gagnée).');
      await db.insert(partnerDeliverable).values({ dealId: d.id, title: b.title, dueOn: b.dueOn || null, note: b.note || null });
      await audit(u.id, 'partenaire.livrable.ajout', d.id, { titre: b.title }, ip);
      return json({ ok: true, message: 'Livrable ajouté.' });
    }
    case 'statut': {
      const [l] = await db.select({ l: partnerDeliverable, orgId: crmDeal.orgId, deal: crmDeal.title }).from(partnerDeliverable).innerJoin(crmDeal, eq(crmDeal.id, partnerDeliverable.dealId)).where(eq(partnerDeliverable.id, b.id));
      if (!l) return fail('Livrable introuvable.', 404);
      const delivered = b.status === 'livre';
      await db.update(partnerDeliverable).set({ status: b.status, link: b.link ?? l.l.link, note: b.note ?? l.l.note, deliveredAt: delivered ? (l.l.deliveredAt ?? new Date()) : null, ...(delivered ? {} : { acknowledgedAt: null, acknowledgedBy: null }) }).where(eq(partnerDeliverable.id, b.id));
      await audit(u.id, 'partenaire.livrable.statut', b.id, { statut: b.status }, ip);
      if (delivered && !l.l.deliveredAt) {
        const reps = await db.select({ id: partnerAccess.userId }).from(partnerAccess).where(eq(partnerAccess.orgId, l.orgId));
        for (const r of reps) await notify(r.id, `Livrable disponible : « ${l.l.title} » (${l.deal}). Confirmez sa réception depuis votre espace partenaire.`, '/espace/partenaire', { email: true });
      }
      return json({ ok: true, message: delivered ? 'Livrable marqué livré ; le partenaire est prévenu.' : 'Statut mis à jour.' });
    }
  }
};
