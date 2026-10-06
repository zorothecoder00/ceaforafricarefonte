/* Comptes des membres (back-office › Membres et rôles), droits « membres » sur tout le site :
   POST { action: 'create', name, email, phone?, country?, role?, roleCountry? } (C) → { ok, id, url, sent }
   POST { action: 'invite', userId }                                          (M) → nouveau lien de mot de passe
   POST { action: 'update', userId, name, email, phone?, country? }          (M)
   POST { action: 'suspend', userId, reason } · { action: 'reactivate', userId } (M)
   POST { action: 'delete', userId, confirm }                                 (V) → confirm = adresse e-mail du compte */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { user } from '../../../db/schema/auth';
import { profile, userRole, roleEnum } from '../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApiAll } from '../../../lib/admin';
import { hasRole, type Action } from '../../../lib/rbac';
import { closeSessions, createMember, deletionBlocker, inviteLink, isLastAdmin } from '../../../lib/members';
import { COUNTRIES } from '../../../data/site';

export const prerender = false;

const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), t.optional());
const Name = z.string().trim().min(2, 'Nom : 2 caractères minimum.').max(120);
const Email = z.email('Adresse e-mail invalide.').max(160);
const Phone = opt(z.string().trim().regex(/^\+\d{8,15}$/, 'Téléphone au format international : +228XXXXXXXX.'));
const Country = opt(z.string().refine((c) => c in COUNTRIES, 'Pays inconnu.'));
const Id = z.string().min(1).max(64);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: Name, email: Email, phone: Phone, country: Country, role: opt(z.enum(roleEnum.enumValues)), roleCountry: Country }),
  z.object({ action: z.literal('invite'), userId: Id }),
  z.object({ action: z.literal('update'), userId: Id, name: Name, email: Email, phone: Phone, country: Country }),
  z.object({ action: z.literal('suspend'), userId: Id, reason: z.string().trim().min(3, 'Indiquez le motif de la suspension.').max(500) }),
  z.object({ action: z.literal('reactivate'), userId: Id }),
  z.object({ action: z.literal('delete'), userId: Id, confirm: z.string().trim().max(160) }),
]);
const NEED: Record<string, Action> = { create: 'C', invite: 'M', update: 'M', suspend: 'M', reactivate: 'M', delete: 'V' };

export const POST: APIRoute = async ({ locals, request, url }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const u = staffApiAll(locals.user, 'membres', NEED[b.action]);
  if (u instanceof Response) return u;
  const ip = clientIp(request);
  const emailTaken = async (email: string, except?: string) =>
    (await db.select({ id: user.id }).from(user).where(and(eq(user.email, email.toLowerCase()), except ? ne(user.id, except) : undefined)).limit(1)).length > 0;
  const phoneTaken = async (phone: string, except?: string) =>
    (await db.select({ id: user.id }).from(user).where(and(eq(user.phoneNumber, phone), except ? ne(user.id, except) : undefined)).limit(1)).length > 0;

  if (b.action === 'create') {
    if (await emailTaken(b.email)) return fail('Un compte existe déjà avec cette adresse e-mail.');
    if (b.phone && await phoneTaken(b.phone)) return fail('Ce numéro de téléphone est déjà utilisé par un autre compte.');
    if (b.role === 'responsable_pays' && !b.roleCountry) return fail('Indiquez le pays du responsable.');
    if (b.role && ['admin', 'direction'].includes(b.role) && !hasRole(u.roles, 'admin')) return fail('Seul un administrateur peut attribuer ce rôle.', 403);
    const id = await createMember(b.name, b.email);
    if (b.phone) await db.update(user).set({ phoneNumber: b.phone, phoneNumberVerified: false }).where(eq(user.id, id));
    if (b.country) await db.update(profile).set({ country: b.country, updatedAt: new Date() }).where(eq(profile.userId, id));
    if (b.role && b.role !== 'membre') await db.insert(userRole).values({ userId: id, role: b.role, country: b.role === 'responsable_pays' ? b.roleCountry : undefined, grantedBy: u.id }).onConflictDoNothing();
    const inv = await inviteLink(id, url.origin, true);
    await audit(u.id, 'admin.compte.creation', id, { role: b.role ?? 'membre', country: b.country, invitationEnvoyee: inv.sent }, ip);
    return json({ ok: true, id, url: inv.url, sent: inv.sent, message: inv.sent ? 'Compte créé : invitation envoyée par e-mail.' : 'Compte créé. L’e-mail n’a pas pu partir : transmettez le lien d’invitation vous-même.' });
  }

  const [target] = await db.select({ id: user.id, email: user.email, name: user.name }).from(user).where(eq(user.id, b.userId));
  if (!target) return fail('Compte introuvable.', 404);
  const targetRoles = (await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, target.id))).map((r) => r.role as string);
  const protectedTarget = targetRoles.some((r) => r === 'admin' || r === 'direction');
  if (protectedTarget && !hasRole(u.roles, 'admin') && b.action !== 'invite') return fail('Seul un administrateur peut modifier le compte d’un administrateur ou de la direction.', 403);

  switch (b.action) {
    case 'invite': {
      const inv = await inviteLink(target.id, url.origin, false);
      await audit(u.id, 'admin.compte.lien_mot_de_passe', target.id, { envoye: inv.sent }, ip);
      return json({ ok: true, url: inv.url, sent: inv.sent, message: inv.sent ? 'Lien envoyé par e-mail.' : 'L’e-mail n’a pas pu partir : transmettez le lien vous-même.' });
    }
    case 'update': {
      if (await emailTaken(b.email, target.id)) return fail('Un autre compte utilise déjà cette adresse e-mail.');
      if (b.phone && await phoneTaken(b.phone, target.id)) return fail('Ce numéro de téléphone est déjà utilisé par un autre compte.');
      const emailChanged = b.email.toLowerCase() !== target.email;
      await db.update(user).set({ name: b.name, email: b.email.toLowerCase(), phoneNumber: b.phone ?? null, ...(emailChanged ? { emailVerified: true } : {}), updatedAt: new Date() }).where(eq(user.id, target.id));
      await db.update(profile).set({ country: b.country ?? null, updatedAt: new Date() }).where(eq(profile.userId, target.id));
      if (emailChanged) await closeSessions(target.id); // l'identifiant change : reconnexion demandée
      await audit(u.id, 'admin.compte.modification', target.id, { nom: b.name !== target.name, email: emailChanged, telephone: b.phone ?? null, pays: b.country ?? null }, ip);
      return json({ ok: true, message: emailChanged ? 'Compte mis à jour. La personne devra se reconnecter avec sa nouvelle adresse.' : 'Compte mis à jour.' });
    }
    case 'suspend': {
      if (target.id === u.id) return fail('Vous ne pouvez pas suspendre votre propre compte.');
      if (await isLastAdmin(target.id)) return fail('C’est le dernier administrateur : il ne peut pas être suspendu.');
      await db.update(profile).set({ suspendedAt: new Date(), suspendedReason: b.reason, suspendedBy: u.id, updatedAt: new Date() }).where(eq(profile.userId, target.id));
      await closeSessions(target.id);
      await audit(u.id, 'admin.compte.suspension', target.id, { motif: b.reason }, ip);
      return json({ ok: true, message: 'Compte suspendu : la personne est déconnectée et ne peut plus se connecter.' });
    }
    case 'reactivate': {
      await db.update(profile).set({ suspendedAt: null, suspendedReason: null, suspendedBy: null, updatedAt: new Date() }).where(eq(profile.userId, target.id));
      await audit(u.id, 'admin.compte.reactivation', target.id, {}, ip);
      return json({ ok: true, message: 'Compte réactivé.' });
    }
    case 'delete': {
      if (b.confirm.toLowerCase() !== target.email) return fail('Saisissez exactement l’adresse e-mail du compte pour confirmer la suppression.');
      const why = await deletionBlocker(target.id, u.id);
      if (why) return fail(why);
      // Effacement (RGPD) : le compte et ses données personnelles sont supprimés en cascade ; le journal garde la trace de l'action
      await audit(u.id, 'admin.compte.suppression', target.id, { roles: targetRoles }, ip);
      await db.delete(user).where(eq(user.id, target.id));
      return json({ ok: true, message: 'Compte supprimé avec ses données personnelles.' });
    }
  }
};
