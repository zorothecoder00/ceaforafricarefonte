/* API du back-office CEA OS (CDC §11). POST { action, … } — chaque action vérifie son droit dans la matrice (§18) et est journalisée. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { contactMessage, report, post, courseReview, job, jobAlert, programmeApplication, userRole, proposal, space, hireDeclaration, roleEnum, ticketFlowEnum, applicationStatusEnum, proposalStatusEnum, profile } from '../../db/schema/app';
import { dossier, dossierEvent, committeeDecision, kycCheck, investorProfile, featureFlag, dossierStatusEnum, verificationLevelEnum, committeeDecisionEnum, kycStatusEnum } from '../../db/schema/kapital';
import { json, fail, audit, clientIp } from '../../lib/session';
import { staffApi, countriesFor } from '../../lib/admin';
import { hasRole, type Obj, type Action } from '../../lib/rbac';
import { statusLabel, FEATURES } from '../../lib/kapital';
import { notify } from '../../lib/notify';

export const prerender = false;

const id = z.uuid();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('contact.status'), id, status: z.enum(ticketFlowEnum.enumValues) }),
  z.object({ action: z.literal('report.status'), id, status: z.enum(ticketFlowEnum.enumValues) }),
  z.object({ action: z.literal('post.status'), id, status: z.enum(['publie', 'masque']) }),
  z.object({ action: z.literal('review.hidden'), userId: z.string().min(1).max(64), courseId: z.string().max(20), hidden: z.boolean() }),
  z.object({ action: z.literal('job.moderate'), id, status: z.enum(['publiee', 'refusee', 'fermee']), featured: z.boolean().optional() }),
  z.object({ action: z.literal('application.update'), id, status: z.enum(applicationStatusEnum.enumValues), score: z.coerce.number().int().min(0).max(100).nullish() }),
  z.object({ action: z.literal('dossier.status'), id, status: z.enum(dossierStatusEnum.enumValues), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal('dossier.update'), id, analystId: z.string().max(64).nullish(), verification: z.enum(verificationLevelEnum.enumValues).optional(), published: z.boolean().optional() }),
  z.object({ action: z.literal('committee.decide'), id, decision: z.enum(committeeDecisionEnum.enumValues), meetingOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), minutes: z.string().max(10000).optional(), conflicts: z.string().max(1000).optional() }),
  z.object({ action: z.literal('kyc.review'), id, status: z.enum(kycStatusEnum.enumValues) }),
  z.object({ action: z.literal('investor.kyc'), userId: z.string().min(1).max(64), status: z.enum(kycStatusEnum.enumValues) }),
  z.object({ action: z.literal('role.grant'), userId: z.string().min(1).max(64), role: z.enum(roleEnum.enumValues), country: z.preprocess((v) => v || undefined, z.string().length(2).optional()) }),
  z.object({ action: z.literal('role.revoke'), userId: z.string().min(1).max(64), role: z.enum(roleEnum.enumValues) }),
  z.object({ action: z.literal('flag.set'), country: z.string().length(2), feature: z.string().refine((f) => FEATURES.some(([k]) => k === f)), enabled: z.boolean(), legalNote: z.string().max(500).optional() }),
  z.object({ action: z.literal('proposal.update'), id, status: z.enum(proposalStatusEnum.enumValues), response: z.string().max(3000).optional() }),
  z.object({ action: z.literal('space.create'), slug: z.string().regex(/^[a-z0-9-]{2,40}$/), name: z.string().trim().min(2).max(80), description: z.string().max(400).optional(), kind: z.enum(['pays', 'secteur', 'profil', 'theme']), country: z.string().max(2).optional() }),
  z.object({ action: z.literal('space.delete'), slug: z.string().max(40) }),
  z.object({ action: z.literal('hire.verify'), id, months: z.union([z.literal(6), z.literal(12)]) }),
]);

const ok = (message = 'Enregistré.') => json({ ok: true, message });

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide : ' + p.error.issues.map((i) => i.path.join('.')).join(', '));
  const b = p.data;
  const ip = clientIp(request);
  const guard = (o: Obj, a: Action) => staffApi(locals.user, o, a);

  switch (b.action) {
    case 'contact.status': {
      const u = guard('messages_contact', 'M'); if (u instanceof Response) return u;
      const cs = await countriesFor(u, 'messages_contact', 'M');
      const [m] = await db.select({ c: contactMessage.country }).from(contactMessage).where(eq(contactMessage.id, b.id));
      if (!m || (cs && !cs.includes(m.c ?? ''))) return fail('Accès refusé.', 403);
      await db.update(contactMessage).set({ status: b.status }).where(eq(contactMessage.id, b.id));
      await audit(u.id, 'admin.contact.statut', b.id, { status: b.status }, ip);
      return ok();
    }
    case 'report.status': {
      const u = guard('moderation', 'M'); if (u instanceof Response) return u;
      await db.update(report).set({ status: b.status }).where(eq(report.id, b.id));
      await audit(u.id, 'admin.signalement.statut', b.id, { status: b.status }, ip);
      return ok();
    }
    case 'review.hidden': {
      const u = guard('moderation', 'M'); if (u instanceof Response) return u;
      const [r] = await db.select({ c: profile.country }).from(courseReview).leftJoin(profile, eq(profile.userId, courseReview.userId)).where(and(eq(courseReview.userId, b.userId), eq(courseReview.courseId, b.courseId)));
      const cs = await countriesFor(u, 'moderation', 'M');
      if (!r || (cs && !cs.includes(r.c ?? ''))) return fail('Accès refusé.', 403);
      await db.update(courseReview).set({ hidden: b.hidden }).where(and(eq(courseReview.userId, b.userId), eq(courseReview.courseId, b.courseId)));
      await audit(u.id, 'admin.avis.' + (b.hidden ? 'masque' : 'publie'), `${b.courseId}:${b.userId}`, {}, ip);
      return ok(b.hidden ? 'Avis masqué.' : 'Avis publié.');
    }
    case 'post.status': {
      const u = guard('moderation', 'M'); if (u instanceof Response) return u;
      const [pt] = await db.select({ author: post.authorId, c: profile.country }).from(post).leftJoin(profile, eq(profile.userId, post.authorId)).where(eq(post.id, b.id));
      const cs = await countriesFor(u, 'moderation', 'M');
      if (!pt || (cs && !cs.includes(pt.c ?? ''))) return fail('Accès refusé.', 403);
      await db.update(post).set({ status: b.status }).where(eq(post.id, b.id));
      if (b.status === 'masque') await notify(pt.author, 'Une de vos publications a été masquée par la modération (charte de la communauté).', '/communaute/fil');
      await audit(u.id, 'admin.publication.' + b.status, b.id, {}, ip);
      return ok(b.status === 'publie' ? 'Publication validée.' : 'Publication masquée.');
    }
    case 'job.moderate': {
      const u = guard('offre_emploi', 'V'); if (u instanceof Response) return u;
      const [j] = await db.select().from(job).where(eq(job.id, b.id));
      if (!j) return fail('Offre introuvable.', 404);
      const exp = new Date(); exp.setDate(exp.getDate() + 60);
      await db.update(job).set({ status: b.status, ...(b.featured !== undefined && { featured: b.featured }), ...(b.status === 'publiee' && !j.publishedAt && { publishedAt: new Date(), expiresAt: exp }) }).where(eq(job.id, b.id));
      if (j.employerId) await notify(j.employerId, b.status === 'publiee' ? `Votre offre « ${j.title} » est publiée.` : b.status === 'refusee' ? `Votre offre « ${j.title} » n'a pas été validée par la modération.` : `Votre offre « ${j.title} » est fermée.`, '/espace/recruteur', { email: true });
      // Alertes emploi correspondantes (WhatsApp) à la première publication
      if (b.status === 'publiee' && !j.publishedAt) {
        const alerts = await db.select().from(jobAlert);
        const hay = `${j.title} ${j.company} ${j.skills.join(' ')}`.toLowerCase();
        for (const a of alerts) {
          const q = a.query as { q?: string; country?: string; type?: string; remote?: boolean };
          if ((q.country && q.country !== j.country) || (q.type && q.type !== j.type) || (q.remote && !j.remote) || (q.q && !hay.includes(q.q.toLowerCase()))) continue;
          await notify(a.userId, `Nouvelle offre pour votre alerte : ${j.title} — ${j.company}`, `/opportunites?q=${encodeURIComponent(j.title)}`, { whatsapp: true });
        }
      }
      await audit(u.id, 'admin.emploi.' + b.status, b.id, {}, ip);
      return ok('Offre mise à jour.');
    }
    case 'application.update': {
      const u = guard('candidature', 'V'); if (u instanceof Response) return u;
      const [a] = await db.select().from(programmeApplication).where(eq(programmeApplication.id, b.id));
      if (!a) return fail('Candidature introuvable.', 404);
      await db.update(programmeApplication).set({ status: b.status, ...(b.score !== undefined && { score: b.score }), updatedAt: new Date() }).where(eq(programmeApplication.id, b.id));
      if (b.status !== a.status) {
        const MSG: Record<string, string> = { en_evaluation: 'est en cours d’évaluation', entretien: ': vous êtes invité·e à un entretien', admise: 'est acceptée. Félicitations !', liste_attente: 'est sur liste d’attente', refusee: "n'a pas été retenue cette fois" };
        if (MSG[b.status]) await notify(a.userId, `Votre candidature ${a.reference} ${MSG[b.status]}`, '/espace/candidatures', { email: true, whatsapp: b.status === 'entretien' || b.status === 'admise' });
      }
      await audit(u.id, 'admin.candidature.statut', a.reference, { from: a.status, to: b.status, score: b.score }, ip);
      return ok('Candidature mise à jour.');
    }
    case 'dossier.status': {
      const u = guard('dossier_kapital', 'M'); if (u instanceof Response) return u;
      const [d] = await db.select().from(dossier).where(eq(dossier.id, b.id));
      if (!d) return fail('Dossier introuvable.', 404);
      if (b.status === d.status) return ok('Statut inchangé.');
      await db.update(dossier).set({ status: b.status, updatedAt: new Date() }).where(eq(dossier.id, b.id));
      await db.insert(dossierEvent).values({ dossierId: d.id, fromStatus: d.status, toStatus: b.status, actorId: u.id, note: b.note });
      await notify(d.ownerId, `Dossier ${d.reference} : ${statusLabel(b.status)}${b.note ? ` — ${b.note}` : ''}`, '/kapital/entreprise', { email: true });
      await audit(u.id, 'kapital.dossier.statut', d.reference, { from: d.status, to: b.status }, ip);
      return ok(`Dossier passé à « ${statusLabel(b.status)} ».`);
    }
    case 'dossier.update': {
      const u = guard('dossier_kapital', 'M'); if (u instanceof Response) return u;
      const [d] = await db.select().from(dossier).where(eq(dossier.id, b.id));
      if (!d) return fail('Dossier introuvable.', 404);
      if (b.published && !d.shareConsent) return fail("Publication impossible : l'entreprise n'a pas donné son accord de partage.");
      if (b.analystId) {
        const [r] = await db.select().from(userRole).where(and(eq(userRole.userId, b.analystId), eq(userRole.role, 'analyste')));
        if (!r) return fail("Cette personne n'a pas le rôle d'analyste.");
      }
      await db.update(dossier).set({ ...(b.analystId !== undefined && { analystId: b.analystId || null }), ...(b.verification && { verification: b.verification }), ...(b.published !== undefined && { published: b.published }), updatedAt: new Date() }).where(eq(dossier.id, b.id));
      if (b.analystId) await notify(b.analystId, `Dossier ${d.reference} (${d.companyName}) vous est assigné.`, `/admin/kapital/${d.id}`);
      await audit(u.id, 'kapital.dossier.modification', d.reference, { analystId: b.analystId, verification: b.verification, published: b.published }, ip);
      return ok();
    }
    case 'committee.decide': {
      const u = guard('decision_comite', 'C'); if (u instanceof Response) return u;
      const [d] = await db.select().from(dossier).where(eq(dossier.id, b.id));
      if (!d) return fail('Dossier introuvable.', 404);
      await db.insert(committeeDecision).values({ dossierId: d.id, meetingOn: new Date(b.meetingOn), decision: b.decision, minutes: b.minutes, conflicts: b.conflicts ? [{ by: u.id, note: b.conflicts }] : [] });
      const next = b.decision === 'favorable' ? 'pret_presentation' : b.decision === 'defavorable' ? 'cloture' : d.status;
      if (next !== d.status) {
        await db.update(dossier).set({ status: next, updatedAt: new Date() }).where(eq(dossier.id, d.id));
        await db.insert(dossierEvent).values({ dossierId: d.id, fromStatus: d.status, toStatus: next, actorId: u.id, note: `Décision du comité : ${b.decision}` });
      }
      await notify(d.ownerId, `Décision du comité pour ${d.reference} : ${b.decision === 'favorable' ? 'avis favorable' : b.decision === 'defavorable' ? 'avis défavorable' : 'dossier ajourné'}.`, '/kapital/entreprise', { email: true });
      await audit(u.id, 'kapital.comite.decision', d.reference, { decision: b.decision }, ip);
      return ok('Décision enregistrée.');
    }
    case 'kyc.review': {
      const u = guard('pieces_kyc', 'V'); if (u instanceof Response) return u;
      const [k] = await db.select().from(kycCheck).where(eq(kycCheck.id, b.id));
      if (!k) return fail('Contrôle introuvable.', 404);
      await db.update(kycCheck).set({ status: b.status, checkedAt: new Date() }).where(eq(kycCheck.id, b.id));
      await audit(u.id, 'conformite.kyc.controle', b.id, { kind: k.kind, status: b.status }, ip);
      return ok('Contrôle mis à jour.');
    }
    case 'investor.kyc': {
      const u = guard('pieces_kyc', 'V'); if (u instanceof Response) return u;
      const review = new Date(); review.setFullYear(review.getFullYear() + 1);
      const res = await db.update(investorProfile).set({ kycStatus: b.status, ...(b.status === 'verifie' && { verifiedAt: new Date(), nextReviewAt: review }) }).where(eq(investorProfile.userId, b.userId)).returning();
      if (!res.length) return fail('Profil investisseur introuvable.', 404);
      if (b.status === 'verifie') await db.insert(userRole).values({ userId: b.userId, role: 'investisseur', grantedBy: u.id }).onConflictDoNothing();
      await notify(b.userId, b.status === 'verifie' ? 'Votre profil investisseur est vérifié : les opportunités détaillées vous sont ouvertes.' : b.status === 'refuse' ? "Votre vérification investisseur n'a pas abouti. Contactez l'équipe conformité." : 'Statut de votre vérification investisseur mis à jour.', '/kapital/investisseur', { email: true });
      await audit(u.id, 'conformite.investisseur.' + b.status, b.userId, {}, ip);
      return ok('Statut KYC mis à jour.');
    }
    case 'role.grant': {
      const u = guard('membres', 'M'); if (u instanceof Response) return u;
      if (b.role === 'responsable_pays' && !b.country) return fail('Indiquez le pays du responsable.');
      if (['admin', 'direction'].includes(b.role) && !hasRole(u.roles, 'admin')) return fail('Seul un administrateur peut attribuer ce rôle.', 403);
      await db.insert(userRole).values({ userId: b.userId, role: b.role, country: b.country, grantedBy: u.id }).onConflictDoUpdate({ target: [userRole.userId, userRole.role], set: { country: b.country, grantedBy: u.id, grantedAt: new Date() } });
      await audit(u.id, 'admin.role.attribution', b.userId, { role: b.role, country: b.country }, ip);
      return ok('Rôle attribué. La double authentification sera exigée si ce rôle est sensible.');
    }
    case 'role.revoke': {
      const u = guard('membres', 'M'); if (u instanceof Response) return u;
      if (b.userId === u.id && b.role === 'admin') return fail('Vous ne pouvez pas retirer votre propre rôle administrateur.');
      if (b.role === 'membre') return fail('Le rôle membre est permanent ; supprimez le compte si nécessaire.');
      await db.delete(userRole).where(and(eq(userRole.userId, b.userId), eq(userRole.role, b.role)));
      await audit(u.id, 'admin.role.retrait', b.userId, { role: b.role }, ip);
      return ok('Rôle retiré.');
    }
    case 'flag.set': {
      const u = guard('interrupteurs', 'M'); if (u instanceof Response) return u;
      if (b.enabled && !b.legalNote?.trim()) return fail("Indiquez la base juridique (agrément, partenaire, avis) avant d'ouvrir une fonction réglementée.");
      await db.insert(featureFlag).values({ country: b.country, feature: b.feature, enabled: b.enabled, legalNote: b.legalNote, updatedBy: u.id }).onConflictDoUpdate({ target: [featureFlag.country, featureFlag.feature], set: { enabled: b.enabled, legalNote: b.legalNote, updatedBy: u.id, updatedAt: new Date() } });
      await audit(u.id, 'admin.interrupteur', `${b.country}:${b.feature}`, { enabled: b.enabled, legalNote: b.legalNote }, ip);
      return ok(`${b.feature} ${b.enabled ? 'ouvert' : 'fermé'} pour ${b.country}.`);
    }
    case 'proposal.update': {
      const u = guard('contenus', 'M'); if (u instanceof Response) return u;
      const [pr] = await db.update(proposal).set({ status: b.status, response: b.response || null, updatedAt: new Date() }).where(eq(proposal.id, b.id)).returning();
      if (!pr) return fail('Proposition introuvable.', 404);
      if (pr.userId) await notify(pr.userId, `Votre proposition « ${pr.title} » : statut mis à jour.`, '/voix');
      await audit(u.id, 'voix.proposition.statut', b.id, { status: b.status }, ip);
      return ok('Proposition mise à jour (suivi public).');
    }
    case 'space.create': {
      const u = guard('contenus', 'C'); if (u instanceof Response) return u;
      const ins = await db.insert(space).values({ id: b.slug, name: b.name, description: b.description, kind: b.kind, country: b.country || null }).onConflictDoNothing().returning();
      if (!ins.length) return fail('Cet identifiant existe déjà.');
      await audit(u.id, 'admin.espace.creation', b.slug, {}, ip);
      return ok('Espace créé.');
    }
    case 'space.delete': {
      const u = guard('contenus', 'V'); if (u instanceof Response) return u;
      await db.delete(space).where(eq(space.id, b.slug));
      await audit(u.id, 'admin.espace.suppression', b.slug, {}, ip);
      return ok('Espace supprimé (les publications sont conservées hors espace).');
    }
    case 'hire.verify': {
      const u = guard('parametres', 'M'); if (u instanceof Response) return u;
      await db.update(hireDeclaration).set(b.months === 6 ? { verified6mAt: new Date() } : { verified12mAt: new Date() }).where(eq(hireDeclaration.id, b.id));
      await audit(u.id, 'impact.embauche.verification', b.id, { months: b.months }, ip);
      return ok(`Emploi vérifié à ${b.months} mois.`);
    }
  }
};
