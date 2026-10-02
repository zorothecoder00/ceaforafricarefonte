/* Textes légaux (CDC §15). Les mentions entre crochets « [à compléter] » doivent être renseignées par CEA et validées par son conseil juridique avant la mise en production. */
export type LegalDoc = { title: string; updated: string; intro: string; sections: [string, string[]][] };

const TODO = '[à compléter par CEA]';

export const LEGAL: Record<string, LegalDoc> = {
  'mentions-legales': {
    title: 'Mentions légales',
    updated: '2026-10-02',
    intro: 'Informations sur l’éditeur et l’hébergeur du site cea4africa.com.',
    sections: [
      ['Éditeur', [`Club des Entrepreneurs Africains (CEA for Africa), ${TODO} : forme juridique, capital ou statut associatif, numéro RCCM, NIF.`, `Siège : ${TODO}, Lomé (Togo).`, 'Contact : contact@cea4africa.com — formulaire /contact.', `Directeur·rice de la publication : ${TODO}.`]],
      ['Hébergement', ['Application : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (régions européennes utilisées pour les fonctions).', 'Base de données : Neon (Databricks), région Europe centrale (Francfort).', `Stockage des documents : ${TODO} (stockage compatible S3, chiffré).`]],
      ['CEA Kapital Invest', ['CEA Kapital Invest est une plateforme d’information et de mise en relation. Elle ne fournit pas de conseil en investissement personnalisé et ne reçoit pas de fonds du public.', 'Les fonctions réglementées (souscriptions, marché secondaire, ordres de bourse, offres au public) ne sont ouvertes, pays par pays, qu’après obtention des agréments requis ou par l’intermédiaire de partenaires agréés (SGI, conseillers en investissement), mentionnés sur chaque page concernée.']],
      ['Propriété intellectuelle', ['Les contenus du site (textes, cours, études, marques, logos) sont protégés. Toute reproduction sans autorisation écrite est interdite, sauf courte citation avec mention de la source.', 'Les contenus publiés par les membres restent leur propriété ; ils accordent à CEA une licence d’affichage sur la plateforme, révocable en supprimant le contenu.']],
      ['Signalement', ['Pour signaler un contenu illicite, une fraude ou une usurpation : /signalement (anonyme possible). Traitement sous 24 heures ouvrées.']],
    ],
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    updated: '2026-10-02',
    intro: 'Nous collectons le minimum de données nécessaire, pour des finalités définies et des durées limitées. Vous gardez la main sur vos données depuis le centre de confidentialité de votre espace (/espace/confidentialite).',
    sections: [
      ['Responsable du traitement', [`CEA for Africa, ${TODO} (adresse du siège). Délégué·e à la protection des données : dpo@cea4africa.com.`, 'Cadres de référence : loi togolaise n° 2019-014 relative à la protection des données à caractère personnel, Convention de l’Union africaine sur la cybersécurité et la protection des données (Malabo), et lois des pays où nous opérons (Côte d’Ivoire, Sénégal, Nigeria, Ghana, Kenya…). Pour les membres résidant dans l’Union européenne : RGPD.']],
      ['Données collectées et finalités', [
        'Compte : nom, e-mail ou téléphone, mot de passe chiffré — pour créer et sécuriser votre compte (exécution du contrat).',
        'Profil 360° : pays, secteur, compétences, besoins et offres — pour vous mettre en relation et personnaliser les recommandations (exécution du contrat ; visibilité choisie par vous).',
        'Paiements : référence, montant, moyen de paiement — pour encaisser et produire les reçus (obligation légale comptable). Nous ne conservons jamais les numéros de carte ni les codes Mobile Money.',
        'Candidatures, projets, dossiers Kapital : informations que vous déposez — pour instruire vos demandes (exécution du contrat).',
        'Vérification d’identité (KYC/KYB) des investisseurs et des entreprises : pièces d’identité, contrôles sanctions et personnes politiquement exposées — obligation de lutte contre le blanchiment ; pièces accessibles à la seule équipe conformité.',
        'Journal d’audit : actions sensibles, adresse IP — sécurité et preuve (intérêt légitime).',
        'Mesure d’audience : uniquement avec votre accord (voir la politique de cookies).',
      ]],
      ['Destinataires', ['Équipes CEA habilitées selon leur rôle (matrice des droits), prestataires techniques sous contrat (hébergement, envoi d’e-mails et de SMS, paiement, vérification d’identité), et — uniquement avec votre accord explicite et révocable — les investisseurs vérifiés pour les dossiers Kapital.', 'Aucune donnée n’est vendue ni louée.']],
      ['Transferts hors du pays', ['Certaines données sont hébergées dans l’Union européenne et aux États-Unis (hébergeur). Ces transferts sont encadrés par des clauses contractuelles et un chiffrement en transit et au repos.']],
      ['Durées de conservation', ['Compte inactif : suppression après 3 ans d’inactivité, après préavis.', 'Données de paiement et factures : 10 ans (obligation comptable).', 'Pièces KYC : 5 ans après la fin de la relation (lutte contre le blanchiment).', 'Journal d’audit : 5 ans.', 'Candidatures non retenues : 2 ans.', 'Messages de contact : 3 ans.']],
      ['Vos droits', ['Accès, rectification, export (bouton « Télécharger mes données »), suppression du compte, opposition, retrait du consentement à tout moment depuis /espace/confidentialite.', 'Réponse sous 30 jours. Vous pouvez saisir l’autorité de protection de votre pays (IPDCP au Togo, ARTCI en Côte d’Ivoire, CDP au Sénégal…).']],
      ['Sécurité', ['Chiffrement TLS, mots de passe hachés, double authentification obligatoire pour les équipes, filigrane et traçabilité des documents de la data room, sauvegardes quotidiennes, journal d’audit non modifiable.']],
    ],
  },
  cookies: {
    title: 'Politique de cookies',
    updated: '2026-10-02',
    intro: 'Seuls les cookies nécessaires sont actifs par défaut. Vous pouvez changer d’avis à tout moment avec le lien « Gérer les cookies » en pied de page.',
    sections: [
      ['Cookies nécessaires (sans consentement)', ['better-auth.session_token : maintien de votre session (durée de la session, 7 jours maximum).', 'Préférences d’affichage stockées dans votre navigateur (thème, taille du texte, mode Lite, devise, choix de cookies) : jamais transmises à des tiers.']],
      ['Mesure d’audience (avec consentement)', ['Matomo, configuré sans cookie de traçage ni recoupement, adresses IP anonymisées, données hébergées par CEA ou son prestataire et jamais partagées à des fins publicitaires.', 'Finalité : comprendre quelles pages sont utiles pour améliorer le site.']],
      ['Pas de publicité', ['Le site n’utilise aucun cookie publicitaire ni réseau social tiers. Les vidéos et cartes intégrées ne sont chargées qu’à votre demande.']],
    ],
  },
  conditions: {
    title: "Conditions générales d'utilisation",
    updated: '2026-10-02',
    intro: 'Ces conditions régissent l’utilisation du site et des espaces connectés de CEA for Africa. En créant un compte, vous les acceptez.',
    sections: [
      ['Compte', ['Un compte par personne, avec des informations exactes. Vous êtes responsable de la confidentialité de vos identifiants ; activez la double authentification.', 'CEA peut suspendre un compte en cas de fraude, d’usurpation ou de non-respect de la charte de la communauté, après notification sauf urgence.']],
      ['Charte de la communauté', ['Respect, bienveillance, pas de harcèlement, de discours haineux, d’arnaque, de sollicitation financière non sollicitée ni de promesse de rendement garanti.', 'Les publications suspectes sont retenues pour modération ; tout membre peut signaler un contenu ou bloquer un autre membre.']],
      ['Adhésion et paiements', ['Les prix sont affichés TTC en FCFA (et convertis à titre indicatif dans votre devise). Les paiements passent par un prestataire agréé (Mobile Money, carte).', 'Remboursement : billets d’événement jusqu’à 7 jours avant la date ; cours en ligne dans les 14 jours si moins de 20 % du contenu a été suivi ; adhésion au prorata en cas de résiliation pour motif légitime.']],
      ['Avertissement sur les investissements', ['Les informations de CEA Kapital Invest ne constituent ni une offre au public, ni un conseil en investissement, ni une recommandation. Investir dans des entreprises non cotées comporte un risque de perte totale du capital et une faible liquidité. N’investissez que ce que vous pouvez vous permettre de perdre et diversifiez.', 'Les chiffres des entreprises sont déclaratifs sauf mention « Vérifié par CEA ».']],
      ['Responsabilité', ['CEA met en œuvre les moyens raisonnables pour assurer la disponibilité et l’exactitude du site, sans garantie de résultat. CEA n’est pas partie aux relations entre membres (recrutement, mentorat, investissement).']],
      ['Droit applicable', ['Droit togolais et Actes uniformes OHADA. À défaut d’accord amiable, compétence des juridictions de Lomé, sous réserve des règles protectrices du pays de résidence du membre.']],
    ],
  },
  accessibilite: {
    title: "Déclaration d'accessibilité",
    updated: '2026-10-02',
    intro: 'CEA for Africa s’engage à rendre son site accessible à toutes et à tous, y compris sur des connexions lentes et des téléphones d’entrée de gamme.',
    sections: [
      ['Objectif', ['Conformité au référentiel WCAG 2.2, niveau AA. État : partiellement conforme (audit externe à réaliser avant la mise en production).']],
      ['Ce qui est en place', ['Navigation complète au clavier, lien d’évitement vers le contenu, focus visible.', 'Contrastes conformes, thème sombre, taille du texte réglable depuis le pied de page.', 'Mode Lite pour les connexions lentes et application installable hors ligne (PWA).', 'Formulaires étiquetés, messages d’erreur explicites, alternatives textuelles.']],
      ['Limites connues', ['Certaines vidéos de replays n’ont pas encore de sous-titres.', 'Les graphiques boursiers disposent d’un tableau de données équivalent, mais pas encore d’une description vocale détaillée.']],
      ['Nous signaler un problème', ['Écrivez-nous via /contact (motif « Accessibilité ») : réponse sous 5 jours ouvrés, avec une alternative accessible au contenu concerné.']],
    ],
  },
};
