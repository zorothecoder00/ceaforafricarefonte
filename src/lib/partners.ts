/* Espace Partenaire (CDC §9, V2) : tableau de bord d'une organisation partenaire — conventions (opportunités gagnées du CRM),
   programmes cofinancés et événements sponsorisés avec leurs indicateurs (src/lib/impact-reports.ts), livrables suivis par
   l'équipe et dont le partenaire confirme la réception. Accès ouvert par l'équipe à un compte membre (rôle « partenaire »). */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { crmDeal, crmOrg, partnerAccess, partnerDeliverable } from '../db/schema/crm';

export const DELIVERABLE_STATUS: Record<string, string> = { a_faire: 'À faire', en_cours: 'En cours', livre: 'Livré' };

export async function orgsOf(userId: string) {
  return db.select({ id: crmOrg.id, name: crmOrg.name, country: crmOrg.country, ownerId: crmOrg.ownerId }).from(partnerAccess)
    .innerJoin(crmOrg, eq(crmOrg.id, partnerAccess.orgId)).where(eq(partnerAccess.userId, userId)).orderBy(asc(crmOrg.name));
}

export async function hasOrgAccess(userId: string, orgId: string) {
  const [a] = await db.select().from(partnerAccess).where(and(eq(partnerAccess.userId, userId), eq(partnerAccess.orgId, orgId)));
  return !!a;
}

/** Livrables des conventions (opportunités gagnées) d'une organisation. */
export async function deliverablesOf(orgId: string) {
  const deals = await db.select({ id: crmDeal.id }).from(crmDeal).where(and(eq(crmDeal.orgId, orgId), eq(crmDeal.stage, 'gagne')));
  if (!deals.length) return [];
  return db.select().from(partnerDeliverable).where(inArray(partnerDeliverable.dealId, deals.map((d) => d.id))).orderBy(asc(partnerDeliverable.dueOn), asc(partnerDeliverable.createdAt));
}

/** Livrable en retard : échéance passée et pas encore livré. */
export const isLate = (d: { dueOn: string | null; status: string }, today = new Date().toISOString().slice(0, 10)) => !!d.dueOn && d.dueOn < today && d.status !== 'livre';
