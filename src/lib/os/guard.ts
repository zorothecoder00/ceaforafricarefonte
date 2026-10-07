/* CEA OS — gardes des API du progiciel interne : connexion, double authentification, fiche personnel active,
   profil autorisé (spécification du prototype, ex. « dg rh »). Les administrateurs du site passent toutes les gardes de profil
   mais les actions personnelles (demandes, temps) exigent une fiche personnel. */
import { fail, type CurrentUser } from '../session';
import { canUse, osContext, type OsCtx, type Person } from './core';

/** Contexte CEA OS de l'appelant, ou réponse d'erreur. spec : profils autorisés ; needMe : fiche personnel obligatoire. */
export async function osApi(user: CurrentUser | null | undefined, spec?: string, needMe = false): Promise<OsCtx | Response> {
  if (!user) return fail('Connexion requise.', 401);
  const c = await osContext(user);
  if (!c.me && !c.superuser) return fail('Réservé au personnel de CEA FOR AFRICA.', 403);
  if (!user.twoFactorEnabled) return fail('Double authentification requise.', 403);
  if (needMe && !c.me) return fail('Votre compte n’est rattaché à aucune fiche du personnel : demandez-la aux ressources humaines.', 403);
  if (spec && !canUse(spec, c)) return fail('Votre profil ne donne pas accès à cette action.', 403);
  return c;
}
export type WithMe = OsCtx & { me: Person };
