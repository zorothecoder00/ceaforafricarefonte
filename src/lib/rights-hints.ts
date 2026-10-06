/* Explication des droits sur les pages du back-office : ce que chaque droit (C, M, V) permet de faire sur un objet.
   La page affiche, pour la personne connectée, les actions qu'elle ne peut pas faire et le droit qui manque
   (voir src/components/RightsHint.astro). Les actions doivent correspondre aux gardes des API (src/pages/api/admin*). */
import { lockReason, OBJ_LABEL, ROLE_LABEL, scope, type Action, type Obj, type Role } from './rbac';

export const ACTION_LABEL: Record<Action, string> = { L: 'lecture', C: 'création', M: 'modification', V: 'validation' };

export const PAGE_ACTIONS: Partial<Record<Obj, Partial<Record<Exclude<Action, 'L'>, string>>>> = {
  fiche_projet: { C: 'créer un projet pour un porteur', M: 'corriger un projet, affecter un chargé de programme, le retirer du portefeuille', V: 'changer le statut d’un projet ou le supprimer' },
  candidature: { V: 'décider des candidatures (statut, note, décision en comité)' },
  programmes: { C: 'créer un appel à candidatures ou une cohorte', M: 'modifier un appel, gérer le jury, les séances, la présence, les jalons et le suivi', V: 'publier, clore ou archiver un appel' },
  offre_emploi: { C: 'saisir une offre d’emploi', M: 'corriger ou prolonger une offre', V: 'publier, refuser, fermer ou mettre en avant une offre' },
  membres: { C: 'créer un compte', M: 'modifier un compte, attribuer ou retirer des rôles, suspendre', V: 'supprimer un compte' },
  dossier_kapital: { M: 'changer le statut d’un dossier, affecter un analyste, le publier aux investisseurs' },
  decision_comite: { C: 'enregistrer une décision du comité d’investissement', V: 'valider une décision du comité' },
  pieces_kyc: { V: 'valider ou refuser les pièces KYC' },
  messages_contact: { M: 'répondre aux messages, les assigner, changer leur statut ou leur priorité' },
  moderation: { M: 'masquer ou rétablir un contenu, traiter un signalement' },
  contenus: { C: 'créer un contenu, déposer une image, créer un espace', M: 'modifier les contenus et les textes du site', V: 'publier ou valider un contenu, supprimer une image ou un espace' },
  interrupteurs: { M: 'ouvrir ou fermer une fonction dans un pays' },
  paiements: { C: 'émettre une facture manuelle', M: 'enregistrer un règlement', V: 'annuler une facture ou émettre un avoir' },
  rapports: { C: 'enregistrer un rapport' },
  formulaires: { C: 'créer un formulaire', M: 'modifier un formulaire', V: 'publier, fermer ou supprimer un formulaire' },
  automatisations: { M: 'tester une automatisation', V: 'créer, modifier, activer ou supprimer une automatisation' },
  parametres: { C: 'créer des domaines d’intervention', M: 'modifier le paramétrage, les domaines d’intervention, les modèles de messages, les redirections et la matrice des droits', V: 'rétablir toute la matrice des droits' },
  crm: { C: 'créer un contact, une organisation ou une opportunité', M: 'les modifier', V: 'effacer un contact (droit à l’effacement)' },
  campagnes: { C: 'créer une campagne', M: 'modifier une campagne ou un modèle', V: 'programmer, envoyer ou annuler une campagne' },
};

export type Missing = { action: Exclude<Action, 'L'>; what: string; own: boolean };

/** Actions de l'objet que la personne ne peut pas faire (ou seulement sur ses éléments propres / son pays). */
export function missingRights(roles: readonly string[], obj: Obj): Missing[] {
  const acts = PAGE_ACTIONS[obj] ?? {};
  return (Object.entries(acts) as [Exclude<Action, 'L'>, string][])
    .map(([action, what]) => ({ action, what, sc: scope(roles, obj, action) }))
    .filter((x) => x.sc !== 'all')
    .map(({ action, what, sc }) => ({ action, what, own: sc === 'own' }));
}

/** Cases verrouillées de la matrice pour les rôles de la personne (le droit ne peut pas être accordé par la matrice). */
export function lockedFor(roles: readonly string[], obj: Obj): string | null {
  for (const r of roles) { const why = lockReason(r as Role, obj); if (why) return why; }
  return null;
}

export const objLabel = (o: Obj) => OBJ_LABEL[o];
export const roleLabels = (roles: readonly string[]) => roles.filter((r) => r !== 'membre').map((r) => ROLE_LABEL[r as Role] ?? r);
