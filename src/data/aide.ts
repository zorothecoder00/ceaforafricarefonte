/* Base de connaissances du centre d'aide (CDC §10). Chaque article décrit une fonction réellement disponible sur le site.
   video : lien d'un tutoriel vidéo (YouTube, Vimeo ou fichier) à renseigner quand l'équipe communication l'aura produit. */

export type HelpArticle = { slug: string; cat: string; q: string; a: string[]; links?: [string, string][]; video?: string };

export const HELP_CATS: Record<string, string> = {
  compte: 'Compte et sécurité',
  paiements: 'Paiements et adhésion',
  evenements: 'Événements et billets',
  apprentissage: 'Apprentissage et certificats',
  accompagnement: 'Programmes, projets et mentorat',
  kapital: 'Kapital Invest',
  donnees: 'Données personnelles',
};

export const HELP: HelpArticle[] = [
  // Compte et sécurité
  { slug: 'creer-un-compte', cat: 'compte', q: 'Comment créer mon compte ?', a: [
    "Cliquez sur « Se connecter » puis choisissez votre méthode : numéro de téléphone (un code vous est envoyé par SMS ou WhatsApp), adresse e-mail, ou compte Google, Apple ou LinkedIn.",
    "Complétez ensuite votre profil 360° : il sert à vous proposer des cours, offres et événements adaptés.",
  ], links: [['/connexion', 'Se connecter'], ['/espace/profil', 'Mon profil']] },
  { slug: 'mot-de-passe-oublie', cat: 'compte', q: "J'ai oublié mon mot de passe", a: [
    "Sur la page de connexion, choisissez « Mot de passe oublié » et indiquez votre adresse e-mail : vous recevez un lien pour en choisir un nouveau.",
    "Si vous vous êtes inscrit par téléphone, connectez-vous simplement avec le code reçu par SMS ou WhatsApp : aucun mot de passe n'est nécessaire.",
  ], links: [['/connexion', 'Page de connexion']] },
  { slug: 'double-authentification', cat: 'compte', q: 'Activer la double authentification et les clés d’accès', a: [
    "Dans Mon espace > Sécurité, activez la double authentification : un code à usage unique vous sera demandé à chaque connexion.",
    "Vous pouvez aussi enregistrer une clé d'accès (empreinte, visage ou code de votre téléphone) pour vous connecter sans mot de passe.",
    "La double authentification est obligatoire pour les rôles sensibles (équipe CEA, analystes, administrateurs).",
  ], links: [['/espace/securite', 'Sécurité de mon compte']] },
  { slug: 'appareils-connectes', cat: 'compte', q: 'Voir et déconnecter mes appareils', a: [
    "Mon espace > Sécurité liste les appareils connectés à votre compte. Déconnectez tout appareil que vous ne reconnaissez pas, puis changez votre mot de passe.",
  ], links: [['/espace/securite', 'Appareils connectés']] },
  { slug: 'notifications', cat: 'compte', q: 'Choisir les notifications que je reçois', a: [
    "Mon espace > Notifications regroupe toutes vos notifications. En bas de page, choisissez pour chaque catégorie si vous voulez aussi les recevoir par e-mail et par WhatsApp ou SMS.",
    "Les heures de silence suspendent les WhatsApp et SMS pendant le créneau choisi (par exemple de 21 h à 7 h).",
  ], links: [['/espace/notifications', 'Mes préférences']] },
  { slug: 'reprendre-un-formulaire', cat: 'compte', q: 'Reprendre un formulaire commencé sur un autre appareil', a: [
    "Les formulaires en plusieurs étapes (candidatures, dossiers…) sont enregistrés automatiquement. Connecté à votre compte, vous retrouvez votre brouillon sur n'importe quel appareil, à l'étape où vous l'aviez laissé.",
  ] },

  // Paiements et adhésion
  { slug: 'payer-mobile-money', cat: 'paiements', q: 'Comment payer avec Mobile Money ?', a: [
    "Au moment du paiement, choisissez votre opérateur (Orange Money, MTN MoMo, Wave, Moov Money, M-Pesa ou Airtel Money) ou la carte bancaire.",
    "Vous êtes redirigé vers la page sécurisée de notre prestataire de paiement : saisissez votre numéro puis validez sur votre téléphone.",
    "Une fois le paiement confirmé, votre reçu est disponible dans Mon espace > Paiements.",
  ], links: [['/espace/paiements', 'Mes paiements']] },
  { slug: 'paiement-non-confirme', cat: 'paiements', q: 'J’ai payé mais ma commande n’apparaît pas', a: [
    "La confirmation de l'opérateur peut prendre quelques minutes. Rouvrez Mon espace > Paiements un peu plus tard.",
    "Si le montant a été débité mais que rien n'apparaît après une heure, ouvrez un ticket en indiquant la date, le montant et le numéro de transaction reçu par SMS.",
  ], links: [['/espace/paiements', 'Mes paiements'], ['/aide#ticket', 'Ouvrir un ticket']] },
  { slug: 'recu-facture', cat: 'paiements', q: 'Obtenir un reçu ou une facture', a: [
    "Chaque paiement confirmé génère un reçu, consultable et imprimable depuis Mon espace > Paiements.",
  ], links: [['/espace/paiements', 'Mes reçus']] },
  { slug: 'adhesion', cat: 'paiements', q: 'Devenir membre et obtenir ma carte', a: [
    "Choisissez votre formule sur la page Adhérer, puis réglez par Mobile Money ou carte. Votre carte de membre numérique, avec QR code, est ensuite disponible dans Mon espace > Carte de membre.",
  ], links: [['/adherer', 'Adhérer'], ['/espace/carte', 'Ma carte de membre']] },

  // Événements et billets
  { slug: 'billet-introuvable', cat: 'evenements', q: "Je n'ai pas reçu mon billet", a: [
    "Tous vos billets sont dans Mon espace > Mes billets. Le QR code fonctionne aussi hors connexion une fois la page ouverte.",
    "Depuis cette page, vous pouvez renvoyer le billet par e-mail ou WhatsApp.",
  ], links: [['/espace/billets', 'Mes billets']] },
  { slug: 'transferer-annuler-billet', cat: 'evenements', q: 'Transférer, annuler ou se faire rembourser un billet', a: [
    "Le transfert à une autre personne est gratuit jusqu'au début de l'événement.",
    "Les billets gratuits s'annulent librement ; la place est proposée à la liste d'attente.",
    "Les billets payants sont remboursables jusqu'à 7 jours avant l'événement, depuis Mon espace > Mes billets.",
  ], links: [['/espace/billets', 'Mes billets']] },
  { slug: 'agenda', cat: 'evenements', q: 'Ajouter un événement ou un rendez-vous à mon agenda', a: [
    "Chaque page d'événement propose un fichier agenda. Vous pouvez aussi vous abonner au calendrier de tous les événements CEA.",
    "Après une prise de rendez-vous ou la confirmation d'une séance de mentorat, les boutons « Google Agenda », « Outlook » et « Autre agenda » ajoutent le rendez-vous avec ses rappels.",
  ], links: [['/evenements', 'Événements'], ['/contact', 'Prendre rendez-vous']] },

  // Apprentissage
  { slug: 'verifier-certificat', cat: 'apprentissage', q: 'Comment vérifier un certificat ?', a: [
    "Scannez le QR code du certificat : il ouvre la page de vérification, qui confirme le titulaire, la formation et la date.",
    "Vos propres certificats sont listés dans Mon espace > Apprentissage, avec un lien « Vérifier » à partager avec un recruteur.",
  ], links: [['/espace/apprentissage', 'Mes certificats']] },
  { slug: 'suivre-un-cours', cat: 'apprentissage', q: 'Suivre un cours de l’Académie', a: [
    "Choisissez un cours dans le catalogue de l'Académie et inscrivez-vous. Votre progression est enregistrée et visible dans Mon espace > Apprentissage.",
    "Le certificat est délivré automatiquement quand toutes les leçons, quiz final compris, sont terminées.",
  ], links: [['/academie', "Catalogue de l'Académie"]] },

  // Accompagnement
  { slug: 'candidater-programme', cat: 'accompagnement', q: 'Candidater à un programme', a: [
    "Ouvrez la page du programme puis « Candidater ». Le formulaire est en plusieurs étapes et s'enregistre au fur et à mesure.",
    "À l'envoi, vous recevez un accusé avec un numéro ; l'état de votre candidature est suivi dans Mon espace > Candidatures.",
  ], links: [['/programmes', 'Programmes'], ['/espace/candidatures', 'Mes candidatures']] },
  { slug: 'reserver-mentor', cat: 'accompagnement', q: 'Réserver une séance de mentorat', a: [
    "Choisissez un mentor dans l'annuaire, puis un créneau, et décrivez votre objectif. Le mentor confirme la séance ; vous êtes notifié et le lien de visio apparaît dans Mon espace > Mentorat.",
    "Un rappel vous est envoyé la veille de la séance.",
  ], links: [['/communaute/mentorat', 'Annuaire des mentors'], ['/espace/mentorat', 'Mes séances']] },
  { slug: 'prendre-rendez-vous', cat: 'accompagnement', q: 'Prendre rendez-vous avec une équipe CEA', a: [
    "Sur la page Contact, choisissez l'équipe puis un créneau libre. Le lien de visio et les boutons d'ajout à l'agenda vous sont envoyés par e-mail.",
  ], links: [['/contact', 'Prendre rendez-vous']] },

  // Kapital
  { slug: 'soumettre-dossier-kapital', cat: 'kapital', q: 'Comment soumettre un dossier à Kapital Invest ?', a: [
    "Faites d'abord le diagnostic « Suis-je prêt ? » : il évalue votre préparation et vous oriente.",
    "Soumettez ensuite votre dossier depuis le résultat. Son avancement (complétude, analyse, comité) est suivi depuis l'espace entreprise.",
  ], links: [['/kapital/diagnostic', 'Diagnostic'], ['/kapital/entreprise', 'Espace entreprise']] },
  { slug: 'reclamation-kapital', cat: 'kapital', q: 'Déposer une réclamation Kapital Invest', a: [
    "Les réclamations sont traitées par l'équipe Conformité : accusé de réception sous 48 heures, réponse sous 10 jours ouvrés.",
  ], links: [['/kapital/reclamations', 'Déposer une réclamation']] },

  // Données personnelles
  { slug: 'telecharger-mes-donnees', cat: 'donnees', q: 'Télécharger mes données', a: [
    "Mon espace > Confidentialité permet de télécharger l'ensemble de vos données (profil, activités, paiements, consentements) au format JSON.",
  ], links: [['/espace/confidentialite', 'Confidentialité']] },
  { slug: 'consentements', cat: 'donnees', q: 'Modifier mes consentements', a: [
    "Vos choix (visibilité dans l'annuaire, communications, partage avec des investisseurs, mesure d'audience) se modifient à tout moment dans Mon espace > Confidentialité. L'historique de vos choix y est conservé.",
  ], links: [['/espace/confidentialite', 'Mes consentements']] },
  { slug: 'supprimer-mon-compte', cat: 'donnees', q: 'Supprimer mon compte', a: [
    "La suppression se fait depuis Mon espace > Confidentialité. Elle est définitive : profil, inscriptions et messages sont effacés.",
    "Les écritures comptables et le journal d'audit sont conservés pendant la durée imposée par la loi.",
  ], links: [['/espace/confidentialite', 'Confidentialité']] },
];

export const helpArticle = (slug: string) => HELP.find((h) => h.slug === slug);
