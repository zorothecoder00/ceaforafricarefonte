/* Liens envoyés par e-mail (suivi de ticket, fichier agenda) : clé HMAC propre à chaque usage, et adresse publique du site. */
import { createHmac } from 'node:crypto';
import { requireEnv } from './env';

export const signRef = (scope: string, ref: string) => createHmac('sha256', requireEnv('BETTER_AUTH_SECRET')).update(`${scope}:${ref}`).digest('base64url').slice(0, 22);

export const siteUrl = () => process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';
