/* Authentification (Better Auth) — CDC §10 :
   e-mail + mot de passe, téléphone + code SMS/WhatsApp, double authentification (TOTP), clés d'accès (passkeys).
   Google, Apple et LinkedIn s'activent automatiquement dès que leurs identifiants sont présents dans l'environnement. */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { passkey } from '@better-auth/passkey';
import { db } from './db';
import { user, session, account, verification, twoFactor as twoFactorTable, passkey as passkeyTable } from '../db/schema/auth';
import { profile, userRole, consent, auditLog } from '../db/schema/app';
import { dossier } from '../db/schema/kapital';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { env, requireEnv } from './env';
import { sendOtp, sendEmail } from './messaging';

const social = (id: 'google' | 'apple' | 'linkedin') => {
  const clientId = env(`${id.toUpperCase()}_CLIENT_ID`), clientSecret = env(`${id.toUpperCase()}_CLIENT_SECRET`);
  return clientId && clientSecret ? { [id]: { clientId, clientSecret } } : {};
};
const baseURL = env('BETTER_AUTH_URL');
const host = baseURL ? new URL(baseURL).hostname : 'localhost';

export const auth = betterAuth({
  appName: 'CEA FOR AFRICA',
  secret: requireEnv('BETTER_AUTH_SECRET'),
  baseURL,
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification, twoFactor: twoFactorTable, passkey: passkeyTable } }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user: u, url }) => {
      await sendEmail(u.email, 'Réinitialisation de votre mot de passe', `Bonjour ${u.name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user: u, url }) => {
      await sendEmail(u.email, 'Confirmez votre adresse e-mail', `Bonjour ${u.name},\n\nConfirmez votre adresse en ouvrant ce lien :\n${url}`);
    },
  },
  socialProviders: { ...social('google'), ...social('apple'), ...social('linkedin') },
  // Suppression du compte depuis le centre de confidentialité (CDC §9.1)
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (u) => {
        const owned = await db.select({ id: dossier.id }).from(dossier).where(eq(dossier.ownerId, u.id)).limit(1);
        if (owned.length) throw new APIError('BAD_REQUEST', { message: 'Un dossier CEA Kapital Invest est rattaché à ce compte : contactez l’équipe Kapital pour le clôturer avant la suppression.' });
        await db.insert(auditLog).values({ actorId: u.id, action: 'compte.suppression', target: u.id });
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 30 },
  // À la création d'un compte : profil, rôle « membre », consentement au compte, trace d'audit
  databaseHooks: {
    user: {
      create: {
        after: async (u) => {
          await db.insert(profile).values({ userId: u.id }).onConflictDoNothing();
          await db.insert(userRole).values({ userId: u.id, role: 'membre' }).onConflictDoNothing();
          await db.insert(consent).values({ userId: u.id, kind: 'compte', granted: true });
          await db.insert(auditLog).values({ actorId: u.id, action: 'compte.creation', target: u.id });
        },
      },
    },
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      sendOTP: ({ phoneNumber, code }) => sendOtp(phoneNumber, code),
      sendPasswordResetOTP: ({ phoneNumber, code }) => sendOtp(phoneNumber, code, 'reinitialisation'),
      // Inscription en 60 secondes avec le seul numéro de téléphone (CDC §4.2)
      signUpOnVerification: {
        getTempEmail: (p) => `${p.replace(/\D/g, '')}@telephone.cea4africa.com`,
        getTempName: (p) => p,
      },
    }),
    twoFactor({ issuer: 'CEA FOR AFRICA' }),
    passkey({ rpID: host, rpName: 'CEA FOR AFRICA', origin: baseURL }),
  ],
});

export type Session = typeof auth.$Infer.Session;
