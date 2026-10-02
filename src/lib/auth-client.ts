/* Client d'authentification côté navigateur (pages de connexion et espace membre). */
import { createAuthClient } from 'better-auth/client';
import { phoneNumberClient, twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

export const authClient = createAuthClient({
  plugins: [phoneNumberClient(), twoFactorClient(), passkeyClient()],
});
