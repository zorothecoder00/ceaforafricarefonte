/* Gestion des comptes par l'équipe (back-office › Membres et rôles) : création avec invitation, lien de mot de passe,
   suspension, suppression. Les comptes passent par Better Auth (mêmes automatismes qu'une inscription : profil, rôle
   membre, consentement, journal). */
import { randomBytes } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { auth } from './auth';
import { db } from './db';
import { env } from './env';
import { sendEmail } from './messaging';
import { user, session } from '../db/schema/auth';
import { userRole } from '../db/schema/app';
import { dossier } from '../db/schema/kapital';

/** Durée de validité d'un lien d'invitation (7 jours). */
export const INVITE_DAYS = 7;

/** Crée le compte (adresse vérifiée par l'équipe, sans mot de passe : la personne le choisit via l'invitation). */
export async function createMember(name: string, email: string): Promise<string> {
  const ctx = await auth.$context;
  const u = await ctx.internalAdapter.createUser({ name, email: email.toLowerCase(), emailVerified: true }, { method: 'admin' });
  return u.id;
}

/** Lien pour choisir son mot de passe (page /connexion/nouveau-mot-de-passe), envoyé par e-mail si possible. */
export async function inviteLink(userId: string, origin: string, firstTime: boolean): Promise<{ url: string; sent: boolean }> {
  const ctx = await auth.$context;
  const token = randomBytes(24).toString('base64url');
  await ctx.internalAdapter.createVerificationValue({ identifier: `reset-password:${token}`, value: userId, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) });
  const base = (env('BETTER_AUTH_URL') ?? origin).replace(/\/$/, '');
  const url = `${base}/connexion/nouveau-mot-de-passe?token=${token}`;
  const [u] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId));
  let sent = false;
  if (u && !u.email.endsWith('@telephone.cea4africa.com')) {
    const subject = firstTime ? 'Votre compte CEA FOR AFRICA est prêt' : 'Choisissez votre mot de passe CEA FOR AFRICA';
    const text = `Bonjour ${u.name},\n\n${firstTime ? 'L’équipe CEA FOR AFRICA vous a créé un compte.' : 'Voici un lien pour choisir votre mot de passe.'} Ouvrez ce lien pour choisir votre mot de passe (valable ${INVITE_DAYS} jours) :\n${url}\n\nVotre identifiant : ${u.email}`;
    sent = await sendEmail(u.email, subject, text).then(() => true, () => false);
  }
  return { url, sent };
}

/** Ferme toutes les sessions d'un compte (suspension, changement d'adresse). */
export const closeSessions = (userId: string) => db.delete(session).where(eq(session.userId, userId));

/** Motif de refus d'une suppression, ou null si elle est possible. */
export async function deletionBlocker(userId: string, actorId: string): Promise<string | null> {
  if (userId === actorId) return 'Pour supprimer votre propre compte, passez par Mon espace › Confidentialité.';
  const [d] = await db.select({ id: dossier.id }).from(dossier).where(eq(dossier.ownerId, userId)).limit(1);
  if (d) return 'Un dossier CEA Kapital Invest est rattaché à ce compte : il doit être clôturé par l’équipe Kapital avant la suppression.';
  if (await isLastAdmin(userId)) return 'C’est le dernier administrateur : nommez-en un autre avant de supprimer ce compte.';
  return null;
}

export async function isLastAdmin(userId: string): Promise<boolean> {
  const [me] = await db.select({ n: sql<number>`1` }).from(userRole).where(and(eq(userRole.userId, userId), eq(userRole.role, 'admin')));
  if (!me) return false;
  const [others] = await db.select({ n: sql<number>`count(*)::int` }).from(userRole).where(and(eq(userRole.role, 'admin'), ne(userRole.userId, userId)));
  return !others?.n;
}
