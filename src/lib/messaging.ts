/* Envoi des codes de vérification par SMS ou WhatsApp (CDC §10).
   Le prestataire n'est pas encore choisi (hypothèse à confirmer, CDC §24) : en développement, le code est affiché
   dans la console du serveur ; en production, l'envoi échoue explicitement tant qu'aucun prestataire n'est configuré. */
import { isProd } from './env';

export async function sendOtp(phoneNumber: string, code: string, purpose: 'connexion' | 'reinitialisation' = 'connexion') {
  if (!isProd()) {
    console.info(`[CEA][dev] Code ${purpose} pour ${phoneNumber} : ${code}`);
    return;
  }
  throw new Error("Aucun prestataire SMS/WhatsApp n'est configuré (src/lib/messaging.ts).");
}
