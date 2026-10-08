/* Banque des tests de compétences de CEA Talents (CDC §7.4). Utilisée uniquement côté serveur : les bonnes réponses (a)
   ne sont jamais envoyées au navigateur. Chaque passage tire DRAW questions au hasard ; réussite à PASS (70 %). */
export type SkillQuestion = { q: string; o: string[]; a: number };
export type SkillTest = { id: string; title: string; skill: string; level: string; minutes: number; intro: string; questions: SkillQuestion[] };

export const DRAW = 8;
export const PASS = 0.7;
export const RETRY_DAYS = 30;

export const SKILL_TESTS: SkillTest[] = [
  {
    id: 'tableur', title: 'Tableur (Excel, Google Sheets)', skill: 'Tableur', level: 'Intermédiaire', minutes: 12,
    intro: 'Formules, références, tris et tableaux croisés : les usages courants en entreprise.',
    questions: [
      { q: 'Quelle formule additionne les cellules A1 à A10 ?', o: ['=SOMME(A1:A10)', '=TOTAL(A1;A10)', '=ADD(A1-A10)', '=SOMME(A1+A10)'], a: 0 },
      { q: 'Dans « =$B$2*C2 », que se passe-t-il quand on recopie la formule vers le bas ?', o: ['B2 reste fixe, C2 devient C3', 'Les deux références changent', 'Aucune référence ne change', 'B2 devient B3, C2 reste fixe'], a: 0 },
      { q: 'Quelle fonction renvoie une valeur d’un tableau à partir d’une clé de recherche ?', o: ['RECHERCHEV (ou RECHERCHEX)', 'CONCATENER', 'ARRONDI', 'NB.SI'], a: 0 },
      { q: 'À quoi sert un tableau croisé dynamique ?', o: ['Résumer et regrouper de grandes listes de données', 'Protéger un classeur par mot de passe', 'Créer une macro', 'Imprimer sur plusieurs pages'], a: 0 },
      { q: 'Que renvoie =SI(B2>=100;"Atteint";"Non atteint") quand B2 vaut 80 ?', o: ['Non atteint', 'Atteint', '80', 'Une erreur'], a: 0 },
      { q: 'Quelle fonction compte les cellules d’une plage qui respectent une condition ?', o: ['NB.SI', 'SOMME', 'MOYENNE', 'MAX'], a: 0 },
      { q: 'Que signifie l’erreur #DIV/0! ?', o: ['Une division par zéro ou par une cellule vide', 'Une référence supprimée', 'Un nom de fonction inconnu', 'Une colonne trop étroite'], a: 0 },
      { q: 'Pour afficher uniquement les ventes d’un pays dans une liste, on utilise…', o: ['Un filtre', 'Une fusion de cellules', 'Un graphique', 'Le gel des volets'], a: 0 },
      { q: 'Quelle formule calcule une augmentation de 18 % (TVA) sur un montant HT en A2 ?', o: ['=A2*1,18', '=A2+18', '=A2/18%', '=A2*18'], a: 0 },
      { q: 'Figer la première ligne d’un tableau sert à…', o: ['Garder les en-têtes visibles en faisant défiler', 'Empêcher sa modification', 'La masquer à l’impression', 'La trier en premier'], a: 0 },
    ],
  },
  {
    id: 'compta-syscohada', title: 'Comptabilité SYSCOHADA : les bases', skill: 'Comptabilité SYSCOHADA', level: 'Débutant', minutes: 12,
    intro: 'Plan comptable, partie double et états financiers dans l’espace OHADA.',
    questions: [
      { q: 'Le principe de la partie double signifie que…', o: ['Chaque opération est enregistrée au débit d’un compte et au crédit d’un autre, pour le même montant', 'Chaque facture est saisie deux fois', 'On tient deux comptabilités séparées', 'Les comptes sont contrôlés par deux personnes'], a: 0 },
      { q: 'Dans le plan SYSCOHADA, la classe 6 regroupe…', o: ['Les charges des activités ordinaires', 'Les produits', 'Les immobilisations', 'Les comptes de trésorerie'], a: 0 },
      { q: 'La classe 5 correspond aux…', o: ['Comptes de trésorerie (banque, caisse)', 'Comptes de tiers', 'Stocks', 'Capitaux propres'], a: 0 },
      { q: 'Un achat de marchandises à crédit se traduit par…', o: ['Un débit en charges (achats) et un crédit au compte fournisseur', 'Un débit en banque et un crédit en ventes', 'Un débit au fournisseur et un crédit en caisse', 'Aucune écriture tant que le fournisseur n’est pas payé'], a: 0 },
      { q: 'Le bilan présente…', o: ['Le patrimoine de l’entreprise à une date donnée (actif et passif)', 'Les ventes du mois', 'Le résultat de l’exercice seulement', 'La liste des salariés'], a: 0 },
      { q: 'Le compte de résultat compare…', o: ['Les produits et les charges d’un exercice', 'L’actif et le passif', 'Les entrées et les sorties de caisse d’une journée', 'Le capital et les dettes'], a: 0 },
      { q: 'Un ordinateur acheté pour l’entreprise et utilisé plusieurs années est…', o: ['Une immobilisation, amortie sur sa durée d’utilisation', 'Une charge du mois', 'Un stock', 'Une créance'], a: 0 },
      { q: 'La TVA collectée sur les ventes est…', o: ['Une dette envers l’État', 'Un produit de l’entreprise', 'Une charge', 'Une créance sur les clients'], a: 0 },
      { q: 'Le rapprochement bancaire consiste à…', o: ['Comparer le compte banque de la comptabilité avec le relevé de la banque', 'Demander un prêt', 'Fusionner deux comptes bancaires', 'Payer les fournisseurs'], a: 0 },
      { q: 'Dans l’espace OHADA, les états financiers annuels doivent être…', o: ['Établis à la clôture de chaque exercice', 'Établis seulement en cas de contrôle fiscal', 'Facultatifs pour toutes les sociétés', 'Remplacés par les relevés bancaires'], a: 0 },
    ],
  },
  {
    id: 'marketing-digital', title: 'Marketing digital', skill: 'Marketing digital', level: 'Intermédiaire', minutes: 12,
    intro: 'Réseaux sociaux, publicité en ligne, indicateurs et WhatsApp Business.',
    questions: [
      { q: 'Le taux de conversion mesure…', o: ['La part des visiteurs qui réalisent l’action visée (achat, inscription…)', 'Le nombre d’abonnés', 'Le prix d’un clic', 'Le temps passé sur une page'], a: 0 },
      { q: 'Un « persona » est…', o: ['Un portrait type d’un client cible', 'Un logiciel de publicité', 'Un influenceur rémunéré', 'Un mot-clé payant'], a: 0 },
      { q: 'Le coût par acquisition (CPA) se calcule en divisant…', o: ['Les dépenses publicitaires par le nombre de clients obtenus', 'Le chiffre d’affaires par le nombre de clics', 'Le nombre d’abonnés par le budget', 'Les ventes par les impressions'], a: 0 },
      { q: 'Un test A/B consiste à…', o: ['Comparer deux versions d’un message ou d’une page auprès de publics similaires', 'Publier à deux heures différentes sans mesurer', 'Demander l’avis de deux collègues', 'Utiliser deux réseaux sociaux'], a: 0 },
      { q: 'Le référencement naturel (SEO) vise à…', o: ['Améliorer la position d’un site dans les résultats de recherche sans payer les clics', 'Acheter des mots-clés', 'Envoyer des SMS en masse', 'Augmenter le nombre de pages vues payantes'], a: 0 },
      { q: 'Pour envoyer des messages marketing sur WhatsApp à vos clients, il faut…', o: ['Leur accord préalable (opt-in)', 'Seulement leur numéro', 'Un groupe d’au moins 100 personnes', 'Rien de particulier'], a: 0 },
      { q: 'Le taux d’engagement d’une publication rapporte…', o: ['Les interactions (réactions, commentaires, partages) à l’audience touchée', 'Le nombre de publications par semaine', 'Le budget dépensé', 'Le nombre de vues de la page d’accueil'], a: 0 },
      { q: 'Le reciblage (retargeting) permet de…', o: ['Montrer des annonces à des personnes qui ont déjà visité votre site', 'Changer de cible chaque semaine', 'Supprimer les mauvais avis', 'Cibler uniquement de nouveaux pays'], a: 0 },
      { q: 'Un appel à l’action (CTA) efficace est…', o: ['Clair, visible et orienté vers une seule action', 'Caché en bas de page', 'Composé de plusieurs liens', 'Toujours une image sans texte'], a: 0 },
      { q: 'Quel indicateur suit la fidélité des clients ?', o: ['Le taux de réachat ou de rétention', 'Le nombre d’impressions', 'Le coût par clic', 'Le nombre d’abonnés'], a: 0 },
    ],
  },
  {
    id: 'gestion-projet', title: 'Gestion de projet', skill: 'Gestion de projet', level: 'Intermédiaire', minutes: 12,
    intro: 'Cadrage, planification, risques et pilotage d’un projet.',
    questions: [
      { q: 'Le chemin critique d’un projet est…', o: ['La suite de tâches qui détermine la durée minimale du projet', 'La liste des tâches les plus chères', 'Le budget de réserve', 'L’ordre alphabétique des tâches'], a: 0 },
      { q: 'Un diagramme de Gantt représente…', o: ['Les tâches dans le temps, avec leurs durées et dépendances', 'L’organigramme de l’équipe', 'Les dépenses par fournisseur', 'Les risques par probabilité'], a: 0 },
      { q: 'Un objectif SMART est…', o: ['Spécifique, mesurable, atteignable, réaliste et daté', 'Simple, moderne, ambitieux, rapide, technologique', 'Validé par la direction seulement', 'Sans échéance'], a: 0 },
      { q: 'Dans une matrice RACI, le « A » désigne…', o: ['La personne qui rend compte et valide (Accountable)', 'L’assistant du projet', 'L’auditeur externe', 'L’acheteur'], a: 0 },
      { q: 'Un registre des risques sert à…', o: ['Identifier, évaluer et suivre les risques et leurs parades', 'Lister les retards passés', 'Archiver les factures', 'Noter les présences en réunion'], a: 0 },
      { q: 'Un jalon (milestone) est…', o: ['Un événement clé sans durée qui marque une étape', 'Une tâche longue', 'Un membre de l’équipe', 'Un budget intermédiaire'], a: 0 },
      { q: 'Dans la méthode Scrum, un sprint est…', o: ['Une période courte et fixe pendant laquelle l’équipe livre un incrément', 'La réunion de lancement', 'Le document de cahier des charges', 'La phase de test finale'], a: 0 },
      { q: 'La « dérive du périmètre » (scope creep) désigne…', o: ['L’ajout progressif de demandes non prévues sans ajuster délais ni budget', 'Une baisse de motivation de l’équipe', 'Un retard de paiement', 'La fin anticipée du projet'], a: 0 },
      { q: 'Un comité de pilotage a pour rôle de…', o: ['Suivre l’avancement et arbitrer les décisions importantes', 'Réaliser les tâches techniques', 'Rédiger les factures', 'Recruter les stagiaires'], a: 0 },
      { q: 'Le retour d’expérience en fin de projet sert à…', o: ['Tirer les leçons pour les projets suivants', 'Désigner un responsable des erreurs', 'Clôturer le compte bancaire', 'Augmenter le budget'], a: 0 },
    ],
  },
  {
    id: 'vente-relation-client', title: 'Vente et relation client', skill: 'Vente et relation client', level: 'Débutant', minutes: 10,
    intro: 'Découverte des besoins, argumentaire, objections et suivi client.',
    questions: [
      { q: 'La première étape d’un entretien de vente efficace est…', o: ['Découvrir les besoins du client par des questions', 'Annoncer le prix', 'Présenter tout le catalogue', 'Proposer une remise'], a: 0 },
      { q: 'Une question ouverte est une question qui…', o: ['Invite le client à s’exprimer librement', 'Appelle une réponse par oui ou non', 'Porte sur le prix', 'Clôt l’entretien'], a: 0 },
      { q: 'Face à l’objection « c’est trop cher », la bonne attitude est de…', o: ['Comprendre ce qui motive l’objection puis rappeler la valeur apportée', 'Baisser immédiatement le prix', 'Ignorer l’objection', 'Mettre fin à l’échange'], a: 0 },
      { q: 'La méthode CAB consiste à présenter…', o: ['Caractéristiques, Avantages, Bénéfices pour le client', 'Coûts, Achats, Budget', 'Client, Argument, Bon de commande', 'Contrat, Acompte, Bilan'], a: 0 },
      { q: 'Un client mécontent qui réclame doit d’abord être…', o: ['Écouté sans être interrompu', 'Redirigé vers un autre service', 'Contredit pour défendre l’entreprise', 'Mis en attente'], a: 0 },
      { q: 'Le suivi après-vente sert surtout à…', o: ['Fidéliser le client et susciter de nouveaux achats', 'Relancer les impayés uniquement', 'Remplir une obligation légale', 'Réduire les stocks'], a: 0 },
      { q: 'Un fichier clients bien tenu permet de…', o: ['Personnaliser les relances et suivre l’historique d’achat', 'Vendre les données à des tiers', 'Se passer de facture', 'Éviter de répondre aux réclamations'], a: 0 },
      { q: 'La vente additionnelle consiste à…', o: ['Proposer un produit complémentaire utile à l’achat principal', 'Vendre à un nouveau client', 'Augmenter tous les prix', 'Supprimer les produits peu vendus'], a: 0 },
      { q: 'Conclure une vente, c’est…', o: ['Obtenir un engagement clair du client (commande, acompte, rendez-vous)', 'Terminer la conversation poliment', 'Envoyer une brochure', 'Promettre un rappel'], a: 0 },
      { q: 'Le Net Promoter Score (NPS) mesure…', o: ['La probabilité qu’un client recommande l’entreprise', 'Le chiffre d’affaires net', 'Le nombre de ventes par vendeur', 'Le délai de livraison'], a: 0 },
    ],
  },
];

export const findTest = (id: string) => SKILL_TESTS.find((t) => t.id === id);
