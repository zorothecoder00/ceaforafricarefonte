/* Contenu des leçons et quiz finals de CEA Academy (CDC §7.6). Contenu de démonstration à faire relire par les formateurs.
   Les bonnes réponses (« a ») ne sont jamais envoyées au navigateur : seule l'API /api/academie/progression les lit. */
export type Lesson = { s: string; k: string[] };
export type Question = { q: string; o: string[]; a: number };
export const PASS_MARK = 0.7;

export const CONTENT: Record<string, { lessons: Lesson[]; quiz: Question[] }> = {
  c1: {
    lessons: [
      { s: 'L’Acte uniforme OHADA sur les sociétés commerciales propose plusieurs formes. Le choix dépend du nombre d’associés, du capital disponible et du besoin de lever des fonds plus tard.', k: ['SARL : 1 associé ou plus, responsabilité limitée aux apports, forme la plus courante pour une PME.', 'SAS : grande liberté statutaire, adaptée à l’entrée d’investisseurs.', 'Statut de l’entreprenant : formalités allégées pour démarrer une petite activité.'] },
      { s: 'L’immatriculation au Registre du commerce et du crédit mobilier (RCCM) donne une existence légale à l’entreprise. Dans la plupart des pays, un guichet unique centralise les formalités.', k: ['Pièces habituelles : statuts, pièce d’identité des dirigeants, justificatif du siège, déclaration de souscription.', 'Le numéro RCCM doit figurer sur les factures et documents commerciaux.', 'Pensez aussi à l’identifiant fiscal et à l’affiliation sociale.'] },
      { s: 'Dès sa création, l’entreprise est soumise à des obligations fiscales qui varient selon le pays et le chiffre d’affaires. Un régime simplifié existe souvent pour les petites entreprises.', k: ['Distinguer impôt sur les sociétés, TVA et taxes locales.', 'Tenir une comptabilité conforme au système comptable OHADA (SYSCOHADA).', 'Noter les échéances déclaratives pour éviter les pénalités.'] },
      { s: 'Les premiers contrats (clients, fournisseurs, bail, salariés) protègent l’entreprise. Un contrat écrit, clair et daté évite la plupart des litiges.', k: ['Préciser l’objet, le prix, les délais et les modalités de paiement.', 'Prévoir les cas de retard et de résiliation.', 'Conserver une copie signée de chaque contrat.'] },
    ],
    quiz: [
      { q: 'Quelle forme de société offre la plus grande liberté statutaire pour accueillir des investisseurs ?', o: ['La SNC', 'La SAS', 'Le GIE'], a: 1 },
      { q: 'Où l’entreprise est-elle immatriculée ?', o: ['Au RCCM', 'À la chambre des notaires', 'À la banque centrale'], a: 0 },
      { q: 'Quel référentiel comptable s’applique dans l’espace OHADA ?', o: ['IFRS uniquement', 'SYSCOHADA', 'US GAAP'], a: 1 },
      { q: 'Que doit préciser un contrat client ?', o: ['Seulement le prix', 'L’objet, le prix, les délais et le paiement', 'Le nom du comptable'], a: 1 },
    ],
  },
  c2: {
    lessons: [
      { s: 'Un modèle financier repose sur des hypothèses explicites : volumes, prix, coûts, délais de paiement. Un investisseur juge d’abord leur réalisme.', k: ['Partir du terrain : capacité de production, nombre de clients, panier moyen.', 'Documenter chaque hypothèse avec une source.', 'Prévoir un scénario prudent et un scénario optimiste.'] },
      { s: 'Le compte de résultat prévisionnel montre si l’activité crée de la valeur : chiffre d’affaires, marge brute, charges fixes et résultat.', k: ['Marge brute = chiffre d’affaires − coûts directs.', 'Les charges fixes augmentent avec la croissance (salaires, loyers).', 'Visez l’équilibre d’exploitation dans un horizon crédible.'] },
      { s: 'Une entreprise rentable peut manquer de trésorerie. Le plan de trésorerie suit les encaissements et décaissements réels, mois par mois.', k: ['Les délais clients et fournisseurs créent un besoin en fonds de roulement (BFR).', 'Les investissements pèsent sur la trésorerie avant de rapporter.', 'Le point bas de trésorerie indique le besoin de financement.'] },
      { s: 'Le besoin de financement couvre les investissements, le BFR et les pertes de démarrage, avec une marge de sécurité.', k: ['Ajoutez 10 à 20 % de marge de sécurité.', 'Combinez fonds propres, dette et subventions selon les usages.', 'Présentez l’utilisation des fonds poste par poste.'] },
    ],
    quiz: [
      { q: 'Qu’est-ce que la marge brute ?', o: ['Le résultat net', 'Le chiffre d’affaires moins les coûts directs', 'La trésorerie disponible'], a: 1 },
      { q: 'Pourquoi une entreprise rentable peut-elle manquer de trésorerie ?', o: ['À cause des délais de paiement et du BFR', 'Parce qu’elle paie trop d’impôts', 'C’est impossible'], a: 0 },
      { q: 'Comment estimer le besoin de financement ?', o: ['Au point bas de la trésorerie prévisionnelle, avec une marge de sécurité', 'En prenant le chiffre d’affaires de l’année 1', 'En copiant un concurrent'], a: 0 },
      { q: 'Que faut-il faire de chaque hypothèse ?', o: ['La cacher', 'La documenter avec une source', 'La maximiser'], a: 1 },
    ],
  },
  c3: {
    lessons: [
      { s: 'Un bon pitch tient en 10 à 12 diapositives et raconte une histoire : un problème réel, votre solution, la preuve que ça marche et ce que vous ferez des fonds.', k: ['Problème, solution, marché, modèle, traction, équipe, concurrence, finances, demande.', 'Une idée par diapositive.', 'Répétez jusqu’à tenir en 5 minutes.'] },
      { s: 'La traction est votre meilleur argument : chiffres de ventes, croissance, clients récurrents, partenariats signés.', k: ['Montrez une courbe plutôt qu’un chiffre isolé.', 'Distinguez chiffres vérifiés et déclaratifs.', 'Citez des clients ou partenaires reconnus, avec leur accord.'] },
      { s: 'La valorisation détermine la part du capital cédée contre l’investissement. En amorçage, elle se négocie plus qu’elle ne se calcule.', k: ['Pré-money + investissement = post-money.', 'Part cédée = investissement / post-money.', 'Comparez avec des transactions similaires de votre région et secteur.'] },
      { s: 'Les investisseurs testent votre lucidité. Préparez les objections sur la concurrence, les risques et les chiffres.', k: ['Reconnaissez les risques et montrez comment vous les gérez.', 'Ne contestez pas : expliquez.', 'Si vous ne savez pas, dites-le et revenez avec la réponse.'] },
    ],
    quiz: [
      { q: 'Avec une valorisation pré-money de 400 M FCFA et un investissement de 100 M, quelle part est cédée ?', o: ['25 %', '20 %', '10 %'], a: 1 },
      { q: 'Quel est le meilleur argument d’un pitch ?', o: ['La traction démontrée', 'Le logo', 'La longueur de la présentation'], a: 0 },
      { q: 'Combien de diapositives pour un pitch efficace ?', o: ['Environ 10 à 12', 'Plus de 40', 'Une seule'], a: 0 },
      { q: 'Face à une question difficile, il faut…', o: ['Inventer une réponse', 'Reconnaître et revenir avec la réponse', 'Changer de sujet'], a: 1 },
    ],
  },
  c4: {
    lessons: [
      { s: 'La Zone de libre-échange continentale africaine (ZLECAf) vise à supprimer progressivement la plupart des droits de douane entre pays africains et à réduire les barrières non tarifaires.', k: ['Un marché de plus de 1,3 milliard de personnes.', 'Démantèlement tarifaire progressif selon les listes de chaque pays.', 'Vérifiez le calendrier applicable à vos produits.'] },
      { s: 'Pour bénéficier des tarifs préférentiels, un produit doit être « originaire » d’un État partie : entièrement obtenu ou suffisamment transformé.', k: ['Consultez les règles d’origine propres à votre produit.', 'Le certificat d’origine est délivré par l’autorité compétente de votre pays.', 'Conservez les justificatifs de fabrication.'] },
      { s: 'La logistique reste le principal coût du commerce intra-africain : transport, transit, stockage et formalités aux frontières.', k: ['Comparez route, mer et air selon le produit.', 'Utilisez un transitaire agréé.', 'Anticipez les délais aux frontières dans vos prix.'] },
      { s: 'Se faire payer entre pays africains devient plus simple : Mobile Money transfrontalier, banques panafricaines et système panafricain de paiement et de règlement (PAPSS).', k: ['Sécurisez le paiement : acompte, lettre de crédit ou plateforme de confiance.', 'Tenez compte du risque de change.', 'PAPSS permet des règlements en monnaies locales.'] },
    ],
    quiz: [
      { q: 'Que faut-il pour bénéficier des tarifs préférentiels de la ZLECAf ?', o: ['Que le produit soit originaire d’un État partie', 'Être une grande entreprise', 'Exporter hors d’Afrique'], a: 0 },
      { q: 'Quel est souvent le principal coût du commerce intra-africain ?', o: ['La logistique', 'La publicité', 'Les salaires'], a: 0 },
      { q: 'Qu’est-ce que PAPSS ?', o: ['Un système panafricain de paiement et de règlement', 'Un réseau social', 'Une taxe douanière'], a: 0 },
      { q: 'Qui délivre le certificat d’origine ?', o: ['L’autorité compétente du pays exportateur', 'Le client', 'Le transporteur'], a: 0 },
    ],
  },
  c5: {
    lessons: [
      { s: 'Le marketing commence par la connaissance du client : qui il est, ce qu’il cherche, où il s’informe et ce qui le fait acheter.', k: ['Parlez à 10 clients avant de dépenser 1 franc.', 'Décrivez un client type (persona).', 'Notez les mots qu’il utilise : ce seront vos messages.'] },
      { s: 'WhatsApp Business est souvent le canal de vente le plus efficace : catalogue, réponses rapides, étiquettes et statuts.', k: ['Créez un catalogue avec prix et photos nettes.', 'Utilisez les messages d’absence et de bienvenue.', 'Respectez le consentement : pas d’envoi massif non sollicité.'] },
      { s: 'Sur les réseaux sociaux, la régularité compte plus que le budget. Choisissez un ou deux réseaux où se trouvent vos clients.', k: ['Publiez régulièrement des contenus utiles, pas seulement des promotions.', 'Montrez les coulisses et les témoignages clients.', 'Testez de petits budgets publicitaires ciblés.'] },
      { s: 'Mesurez pour décider : combien de contacts, de ventes et quel coût d’acquisition par client.', k: ['Suivez quelques indicateurs simples chaque semaine.', 'Demandez à chaque client comment il vous a connu.', 'Arrêtez ce qui ne rapporte pas.'] },
    ],
    quiz: [
      { q: 'Par quoi commence une démarche marketing ?', o: ['Acheter de la publicité', 'Connaître son client', 'Créer un logo'], a: 1 },
      { q: 'Sur WhatsApp Business, il faut…', o: ['Envoyer des messages en masse sans accord', 'Respecter le consentement des contacts', 'Éviter le catalogue'], a: 1 },
      { q: 'Sur les réseaux sociaux, qu’est-ce qui compte le plus ?', o: ['La régularité', 'Le nombre de réseaux', 'Les promotions uniquement'], a: 0 },
      { q: 'Qu’est-ce que le coût d’acquisition client ?', o: ['Le coût marketing pour obtenir un client', 'Le prix de vente', 'Le salaire du commercial'], a: 0 },
    ],
  },
  c6: {
    lessons: [
      { s: 'Ouvrir son capital permet de financer la croissance sans endettement excessif et d’attirer des compétences, en échange d’une part de la propriété.', k: ['Fonds propres : pas de remboursement, mais partage de la valeur.', 'Adapté aux projets de croissance au retour incertain.', 'Choisissez des investisseurs alignés avec votre vision.'] },
      { s: 'Le pacte d’associés complète les statuts : il organise les relations entre associés, la gouvernance et les conditions de sortie.', k: ['Clauses fréquentes : préemption, sortie conjointe, non-concurrence.', 'Prévoir les règles de décision importantes.', 'Faites-le rédiger ou relire par un juriste.'] },
      { s: 'Chaque levée dilue les associés existants. Il faut anticiper la dilution sur plusieurs tours pour garder un contrôle adapté.', k: ['Dilution = part cédée aux nouveaux entrants.', 'Simulez les tours futurs dans une table de capitalisation.', 'Le contrôle peut aussi s’organiser par la gouvernance.'] },
      { s: 'Une bonne gouvernance rassure les investisseurs : conseil, reporting régulier, séparation des patrimoines.', k: ['Reporting trimestriel clair et honnête.', 'Conseil d’administration ou comité stratégique.', 'Comptes certifiés quand la taille l’exige.'] },
    ],
    quiz: [
      { q: 'Quel document organise les relations entre associés en complément des statuts ?', o: ['Le pacte d’associés', 'Le bail commercial', 'La facture'], a: 0 },
      { q: 'Qu’est-ce que la dilution ?', o: ['La baisse de la part des associés existants lors d’une levée', 'Une baisse du chiffre d’affaires', 'Un impôt'], a: 0 },
      { q: 'Quel est l’avantage principal des fonds propres ?', o: ['Pas de remboursement obligatoire', 'Aucun partage de la valeur', 'Des intérêts plus élevés'], a: 0 },
      { q: 'Qu’est-ce qui rassure un investisseur ?', o: ['Un reporting régulier et une gouvernance claire', 'L’absence de comptes', 'Un pacte oral'], a: 0 },
    ],
  },
  c7: {
    lessons: [
      { s: 'Un recrutement réussi commence par une définition précise du poste : missions, compétences, résultats attendus et rémunération.', k: ['Écrivez la fiche de poste avant de publier l’offre.', 'Distinguez compétences indispensables et souhaitées.', 'Fixez une fourchette de salaire réaliste.'] },
      { s: 'Pour recruter sans se tromper, combinez entretien structuré, mise en situation et prise de références.', k: ['Posez les mêmes questions à chaque candidat.', 'Proposez un cas pratique court.', 'Évitez tout critère discriminatoire.'] },
      { s: 'Le contrat de travail et les déclarations sociales protègent l’employeur comme le salarié. Les règles dépendent du code du travail de chaque pays.', k: ['Contrat écrit précisant poste, salaire, durée et période d’essai.', 'Affiliation à la caisse de sécurité sociale.', 'Bulletin de paie à chaque versement.'] },
      { s: 'Fidéliser coûte moins cher que recruter : reconnaissance, perspectives d’évolution, formation et climat de travail.', k: ['Entretien individuel au moins une fois par an.', 'Formation continue (CEA Academy).', 'Reconnaissance et partage des résultats.'] },
    ],
    quiz: [
      { q: 'Que faut-il rédiger avant de publier une offre ?', o: ['La fiche de poste', 'Le contrat de travail', 'Le bulletin de paie'], a: 0 },
      { q: 'Un entretien structuré consiste à…', o: ['Poser les mêmes questions à chaque candidat', 'Improviser', 'Ne pas prendre de notes'], a: 0 },
      { q: 'Lequel de ces critères est interdit dans une offre ?', o: ['La maîtrise d’Excel', 'L’origine ethnique', 'L’expérience en vente'], a: 1 },
      { q: 'Quelle pratique aide à fidéliser ?', o: ['La formation continue', 'L’absence d’entretien annuel', 'Les retards de salaire'], a: 0 },
    ],
  },
  c8: {
    lessons: [
      { s: 'Une action est une part du capital d’une société. Elle donne droit à une part des bénéfices (dividendes) et à voter en assemblée générale.', k: ['La valeur d’une action varie selon l’offre et la demande.', 'Le dividende n’est pas garanti.', 'Investir en actions comporte un risque de perte en capital.'] },
      { s: 'La Bourse régionale des valeurs mobilières (BRVM), basée à Abidjan, est commune aux huit pays de l’UEMOA.', k: ['Bénin, Burkina Faso, Côte d’Ivoire, Guinée-Bissau, Mali, Niger, Sénégal et Togo.', 'Elle cote des actions et des obligations.', 'Elle est supervisée par l’autorité régionale des marchés financiers.'] },
      { s: 'Pour acheter ou vendre des titres à la BRVM, il faut passer par une société de gestion et d’intermédiation (SGI) agréée.', k: ['La SGI ouvre votre compte-titres et transmet vos ordres.', 'Comparez les frais de courtage et de tenue de compte.', 'Vérifiez l’agrément de la SGI auprès du régulateur.'] },
      { s: 'Une cotation indique le dernier cours, la variation, les volumes échangés et parfois le rendement du dividende.', k: ['Variation : évolution par rapport à la séance précédente.', 'Volume : nombre de titres échangés.', 'Ne décidez jamais sur une seule séance : regardez la durée.'] },
    ],
    quiz: [
      { q: 'Combien de pays partagent la BRVM ?', o: ['8 pays de l’UEMOA', '15 pays de la CEDEAO', '54 pays africains'], a: 0 },
      { q: 'Par qui faut-il passer pour acheter des actions à la BRVM ?', o: ['Une SGI agréée', 'Directement la société', 'Un opérateur mobile'], a: 0 },
      { q: 'Le dividende est-il garanti ?', o: ['Oui, toujours', 'Non', 'Seulement la première année'], a: 1 },
      { q: 'Qu’indique le volume d’une cotation ?', o: ['Le nombre de titres échangés', 'Le bénéfice de la société', 'Le nombre d’actionnaires'], a: 0 },
    ],
  },
};
