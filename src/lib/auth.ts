/* Authentification (Better Auth) : e-mail + mot de passe, téléphone + code SMS/WhatsApp (CDC §10).
   Google, Apple et LinkedIn s'activent automatiquement dès que leurs identifiants sont présents dans l'environnement. */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { db } from './db';
import { user, session, account, verification } from '../db/schema/auth';
import { env, requireEnv } from './env';
import { sendOtp } from './messaging';

const social = (id: 'google' | 'apple' | 'linkedin') => {
  const clientId = env(`${id.toUpperCase()}_CLIENT_ID`), clientSecret = env(`${id.toUpperCase()}_CLIENT_SECRET`);
  return clientId && clientSecret ? { [id]: { clientId, clientSecret } } : {};
};

export const auth = betterAuth({
  appName: 'CEA FOR AFRICA',
  secret: requireEnv('BETTER_AUTH_SECRET'),
  baseURL: env('BETTER_AUTH_URL'),
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  socialProviders: { ...social('google'), ...social('apple'), ...social('linkedin') },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 30 },
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
  ],
});

export type Session = typeof auth.$Infer.Session;
