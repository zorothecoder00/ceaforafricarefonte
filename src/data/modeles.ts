/* Modèles juridiques à adapter (CDC §7.1, MVP : « modèles de pacte d'associés et de statuts, à adapter par un conseil »).
   Référence : Acte uniforme OHADA relatif au droit des sociétés commerciales et du GIE (AUSCGIE), révisé le 30 janvier 2014.
   Les [crochets] sont à compléter. Les montants minimaux et formalités varient selon l'État : à vérifier avec un professionnel. */

export type Modele = { slug: string; cat: 'capital' | 'gouvernance'; title: string; short: string; usage: string; sections: [string, string[]][] };
export const CATEGORIES: Record<Modele['cat'], string> = { capital: 'Ouvrir son capital', gouvernance: 'Gouvernance et procès-verbaux' };

const AVERT = "Ce modèle est fourni à titre pédagogique par CEA FOR AFRICA. Il ne constitue pas un conseil juridique et doit être relu et adapté par un avocat, un notaire ou un conseil juridique avant toute signature, en fonction de votre situation et du droit de l'État où la société est immatriculée.";

export const MODELES: Modele[] = [
  {
    slug: 'pacte-associes',
    cat: 'capital',
    title: "Pacte d'associés (SAS ou SARL)",
    short: "Organise les relations entre associés au-delà des statuts : gouvernance, sortie, entrée d'investisseurs.",
    usage: "À signer lors de l'entrée d'un nouvel associé ou d'un investisseur. Le pacte reste confidentiel, contrairement aux statuts déposés au RCCM.",
    sections: [
      ['Parties', [
        "[Dénomination sociale], [forme] au capital de [montant] FCFA, siège social [adresse], immatriculée au RCCM de [ville] sous le numéro [numéro] (la « Société »).",
        "Les associés signataires, désignés en annexe 1 avec le nombre de titres détenus par chacun (les « Associés »).",
      ]],
      ['Article 1 — Objet', [
        "Le présent pacte organise les relations entre les Associés, la gouvernance de la Société et les conditions de transfert des titres. En cas de contradiction avec les statuts, les Associés s'engagent à voter les modifications statutaires nécessaires pour assurer le respect du pacte.",
      ]],
      ['Article 2 — Gouvernance', [
        "La Société est dirigée par [le gérant / le président]. Un comité stratégique de [nombre] membres est institué ; [nombre] membres sont désignés par [les fondateurs] et [nombre] par [les investisseurs].",
        "Les décisions suivantes requièrent l'accord préalable du comité stratégique à la majorité de [fraction] : adoption du budget annuel ; emprunt ou sûreté supérieurs à [montant] FCFA ; acquisition ou cession d'actifs significatifs ; recrutement ou révocation des dirigeants ; émission de nouveaux titres.",
      ]],
      ['Article 3 — Information des Associés', [
        "La Société communique à chaque Associé : les comptes annuels dans les [nombre] mois de la clôture ; un tableau de bord [trimestriel] (chiffre d'affaires, trésorerie, effectifs) ; toute information significative dans un délai raisonnable.",
      ]],
      ['Article 4 — Inaliénabilité', [
        "Les fondateurs s'interdisent de céder leurs titres pendant [durée] à compter de la signature, sauf accord préalable des Associés représentant [fraction] des titres.",
      ]],
      ['Article 5 — Droit de préemption', [
        "Tout Associé souhaitant céder ses titres notifie aux autres Associés le prix, le nombre de titres et l'identité du cessionnaire envisagé. Les autres Associés disposent de [30] jours pour exercer leur droit de préemption, au prorata de leur participation.",
      ]],
      ['Article 6 — Agrément', [
        "Toute cession à un tiers non associé est soumise à l'agrément [de la collectivité des Associés statuant à la majorité de / du comité stratégique], dans les conditions prévues par les statuts et l'AUSCGIE.",
      ]],
      ['Article 7 — Sortie conjointe (tag-along)', [
        "Si un ou plusieurs Associés cèdent des titres conférant le contrôle de la Société, les autres Associés peuvent céder leurs titres au même prix et aux mêmes conditions.",
      ]],
      ['Article 8 — Sortie forcée (drag-along)', [
        "Si des Associés détenant au moins [fraction] des titres acceptent une offre portant sur 100 % du capital, les autres Associés s'engagent à céder leurs titres aux mêmes conditions de prix.",
      ]],
      ['Article 9 — Anti-dilution et émissions nouvelles', [
        "En cas d'émission de nouveaux titres, chaque Associé bénéficie d'un droit préférentiel de souscription au prorata de sa participation. [Clause d'ajustement en cas d'émission à un prix inférieur au prix payé par les investisseurs, à négocier.]",
      ]],
      ['Article 10 — Engagements des fondateurs', [
        "Les fondateurs consacrent l'essentiel de leur temps professionnel à la Société, s'interdisent toute activité concurrente pendant leur présence et [durée] après leur départ dans [zone géographique], et cèdent à la Société les droits de propriété intellectuelle liés à son activité.",
        "Bon et mauvais départ : en cas de départ d'un fondateur avant [durée], ses titres pourront être rachetés à [la valeur nominale / la valeur de marché] selon les cas définis en annexe 2.",
      ]],
      ['Article 11 — Durée, confidentialité, litiges', [
        "Le pacte est conclu pour [durée] et prend fin de plein droit si un Associé ne détient plus de titres, pour ce qui le concerne. Les Associés gardent confidentiels son contenu et les informations reçues de la Société.",
        "Tout différend fait l'objet d'une tentative de règlement amiable de [30] jours, puis est soumis [à l'arbitrage de la Cour commune de justice et d'arbitrage (CCJA) / au tribunal de commerce de [ville]].",
      ]],
      ['Signatures', ["Fait à [ville], le [date], en [nombre] exemplaires originaux. Signature de chaque Associé précédée de la mention « lu et approuvé »."]],
    ],
  },
  {
    slug: 'statuts-sas',
    cat: 'capital',
    title: 'Statuts de société par actions simplifiée (SAS)',
    short: "Forme souple, adaptée à l'entrée d'investisseurs et aux start-up.",
    usage: "À adapter avant le dépôt au RCCM, au guichet unique de création d'entreprise du pays.",
    sections: [
      ['Article 1 — Forme', ["Il est constitué une société par actions simplifiée régie par l'Acte uniforme OHADA relatif au droit des sociétés commerciales et du GIE, les lois applicables dans l'État de [pays] et les présents statuts."]],
      ['Article 2 — Objet', ["La Société a pour objet, en [pays] et à l'étranger : [description précise de l'activité], et plus généralement toutes opérations se rattachant directement ou indirectement à cet objet."]],
      ['Article 3 — Dénomination', ["La Société a pour dénomination : [dénomination], suivie de la mention « société par actions simplifiée » ou « SAS » et du montant du capital."]],
      ['Article 4 — Siège social', ["Le siège social est fixé à [adresse complète]. Il peut être transféré par décision du président, sous réserve de ratification par les associés."]],
      ['Article 5 — Durée', ["La durée de la Société est de [99] ans à compter de son immatriculation au RCCM, sauf dissolution anticipée ou prorogation."]],
      ['Article 6 — Apports et capital', [
        "Le capital social est fixé à [montant] FCFA, divisé en [nombre] actions de [valeur nominale] FCFA chacune, entièrement souscrites et libérées [en totalité / à hauteur de …], réparties entre les associés selon l'annexe.",
        "Vérifiez le capital minimum et le montant nominal minimal des actions applicables dans votre État.",
      ]],
      ['Article 7 — Actions', ["Les actions sont nominatives. Elles sont inscrites en compte au nom de leur titulaire dans les registres tenus par la Société. Des actions de préférence peuvent être créées par décision collective des associés."]],
      ['Article 8 — Transmission des actions', ["Les actions se transmettent par virement de compte à compte. [Toute cession à un tiers est soumise à l'agrément préalable de la collectivité des associés statuant à la majorité de …]. [Clause d'inaliénabilité éventuelle, d'une durée maximale prévue par la loi.]"]],
      ['Article 9 — Président', [
        "La Société est représentée à l'égard des tiers par un président, personne physique ou morale, associé ou non, nommé par décision collective des associés pour une durée [déterminée / indéterminée].",
        "Le président est investi des pouvoirs les plus étendus pour agir au nom de la Société dans la limite de l'objet social. [Les statuts peuvent prévoir un ou plusieurs directeurs généraux.]",
      ]],
      ['Article 10 — Décisions collectives', [
        "Relèvent obligatoirement de la collectivité des associés : l'approbation des comptes et l'affectation du résultat, les modifications du capital, les fusions, scissions, dissolution, la transformation, la nomination des commissaires aux comptes, et les autres décisions que la loi lui réserve.",
        "Les décisions sont prises en assemblée, par consultation écrite ou par acte signé de tous les associés, [à la majorité de … des droits de vote pour les décisions ordinaires et de … pour les décisions extraordinaires]. Les décisions unanimes requises par la loi restent réservées.",
      ]],
      ['Article 11 — Commissaire aux comptes', ["Un ou plusieurs commissaires aux comptes sont désignés lorsque les seuils fixés par l'AUSCGIE sont atteints, ou volontairement."]],
      ['Article 12 — Exercice social et comptes', ["L'exercice social commence le 1er janvier et se termine le 31 décembre. Les comptes sont établis conformément au SYSCOHADA révisé et soumis à l'approbation des associés dans les six mois de la clôture."]],
      ['Article 13 — Affectation du résultat', ["Sur le bénéfice de l'exercice, diminué le cas échéant des pertes antérieures, il est prélevé la dotation à la réserve légale prévue par la loi. Le solde est affecté ou distribué par décision collective des associés."]],
      ['Article 14 — Dissolution, litiges', ["À l'expiration de la Société ou en cas de dissolution anticipée, la liquidation est effectuée conformément à l'AUSCGIE. Les contestations relatives aux affaires sociales sont soumises [au tribunal de commerce de … / à l'arbitrage CCJA]."]],
      ['Signatures', ["Fait à [ville], le [date], en [nombre] exemplaires, dont un pour le dépôt au RCCM. Signatures des associés fondateurs."]],
    ],
  },
  {
    slug: 'statuts-sarl',
    cat: 'capital',
    title: 'Statuts de société à responsabilité limitée (SARL)',
    short: 'La forme la plus courante pour une PME : cadre légal sécurisant, gérance simple.',
    usage: "Adaptée à un ou plusieurs associés souhaitant une gouvernance encadrée par la loi.",
    sections: [
      ['Article 1 — Forme', ["Il est constitué une société à responsabilité limitée régie par l'Acte uniforme OHADA relatif au droit des sociétés commerciales et du GIE, les lois applicables dans l'État de [pays] et les présents statuts. [Si un seul associé : « société à responsabilité limitée unipersonnelle ».]"]],
      ['Article 2 — Objet', ["La Société a pour objet : [description précise de l'activité], et toutes opérations se rattachant directement ou indirectement à cet objet."]],
      ['Article 3 — Dénomination, siège, durée', ["Dénomination : [dénomination], suivie de « SARL » et du montant du capital. Siège social : [adresse]. Durée : [99] ans à compter de l'immatriculation au RCCM."]],
      ['Article 4 — Apports et capital', [
        "Le capital social est fixé à [montant] FCFA, divisé en [nombre] parts sociales de [valeur nominale] FCFA chacune, entièrement libérées et attribuées aux associés en proportion de leurs apports : [répartition].",
        "Vérifiez le capital minimum et la valeur nominale minimale des parts applicables dans votre État. Les fonds sont déposés auprès d'une banque ou d'un notaire jusqu'à l'immatriculation.",
      ]],
      ['Article 5 — Cession des parts', ["Les parts sont librement cessibles entre associés [ou : soumises à agrément]. Leur cession à des tiers n'est possible qu'avec le consentement de la majorité des associés représentant au moins les trois quarts des parts sociales, déduction faite des parts de l'associé cédant, sauf clause plus restrictive."]],
      ['Article 6 — Gérance', ["La Société est gérée par un ou plusieurs gérants, personnes physiques, associés ou non, nommés par les associés [dans les statuts / par décision ordinaire] pour [durée]. Dans les rapports avec les tiers, le gérant est investi des pouvoirs les plus étendus pour agir au nom de la Société, dans la limite de l'objet social."]],
      ['Article 7 — Décisions collectives', ["Les décisions ordinaires sont adoptées par un ou plusieurs associés représentant plus de la moitié du capital. Les décisions modifiant les statuts sont adoptées par les associés représentant au moins les trois quarts du capital, sous réserve des décisions que la loi soumet à l'unanimité."]],
      ['Article 8 — Comptes et affectation du résultat', ["L'exercice social coïncide avec l'année civile. Les comptes, établis selon le SYSCOHADA révisé, sont approuvés par les associés dans les six mois de la clôture. La dotation à la réserve légale est prélevée avant toute distribution."]],
      ['Article 9 — Commissaire aux comptes', ["Un commissaire aux comptes est désigné lorsque les seuils fixés par l'AUSCGIE sont dépassés."]],
      ['Article 10 — Dissolution, litiges', ["La dissolution et la liquidation interviennent dans les conditions de l'AUSCGIE. Les contestations sont soumises [au tribunal de commerce de … / à l'arbitrage CCJA]."]],
      ['Signatures', ["Fait à [ville], le [date], en [nombre] exemplaires. Signatures des associés."]],
    ],
  },
  {
    slug: 'pv-conseil-administration',
    cat: 'gouvernance',
    title: "Procès-verbal de réunion du conseil d'administration",
    short: 'Trame de procès-verbal pour consigner les délibérations et décisions du conseil.',
    usage: "À établir après chaque réunion, signer par le président de séance et au moins un administrateur, puis conserver au registre des procès-verbaux.",
    sections: [
      ['En-tête', ["[Dénomination sociale], société anonyme au capital de [montant] FCFA, siège social [adresse], RCCM [numéro].", "Procès-verbal de la réunion du conseil d'administration du [date]."]],
      ['Convocation, présence et quorum', [
        "Le conseil d'administration s'est réuni le [date] à [heure], à [lieu / par visioconférence], sur convocation du président en date du [date].",
        "Présents : [noms]. Représentés : [noms et mandataires]. Absents excusés : [noms]. Assistent également : [commissaire aux comptes, invités].",
        "[Nombre] administrateurs sur [nombre] étant présents ou représentés, le quorum prévu par les statuts et l'AUSCGIE est atteint ; le conseil peut valablement délibérer.",
      ]],
      ['Ordre du jour', ['1. Approbation du procès-verbal de la réunion précédente.', '2. [Point].', '3. [Point].', '4. Questions diverses.']],
      ['Déclaration des conflits d’intérêts', ["Le président demande à chaque administrateur de déclarer tout conflit d'intérêts au regard de l'ordre du jour. [Aucun conflit déclaré / M. ou Mme … déclare un intérêt sur le point … et ne prend pas part au vote.]"]],
      ['Délibérations', ["Point [n°] — [intitulé]. Exposé : [résumé des documents présentés et des échanges]. Après en avoir délibéré, le conseil [adopte / rejette] la résolution suivante : « [texte de la décision] ». Vote : pour [n], contre [n], abstentions [n]."]],
      ['Clôture', ["L'ordre du jour étant épuisé, la séance est levée à [heure]. De tout ce qui précède, il a été dressé le présent procès-verbal, signé par le président de séance et [un administrateur]."]],
      ['Signatures', ['Le président de séance : [nom, signature]', "L'administrateur : [nom, signature]"]],
    ],
  },
  {
    slug: 'pv-assemblee-generale',
    cat: 'gouvernance',
    title: "Procès-verbal d'assemblée générale ordinaire annuelle",
    short: 'Approbation des comptes, affectation du résultat, renouvellement des mandats.',
    usage: "L'assemblée ordinaire annuelle se tient dans les six mois de la clôture de l'exercice. Le procès-verbal est signé par les membres du bureau.",
    sections: [
      ['En-tête', ["[Dénomination sociale], [forme] au capital de [montant] FCFA, siège social [adresse], RCCM [numéro].", "Procès-verbal de l'assemblée générale ordinaire annuelle du [date]."]],
      ['Constitution du bureau', [
        "Les associés ou actionnaires se sont réunis le [date] à [heure], à [lieu], sur convocation [du conseil d'administration / du gérant / du président] adressée le [date].",
        "L'assemblée est présidée par [nom]. [Noms] sont désignés scrutateurs et [nom] secrétaire. Une feuille de présence a été émargée.",
        "Les actionnaires présents ou représentés possèdent [nombre] actions sur [nombre] ; le quorum requis est atteint.",
      ]],
      ['Documents mis à disposition', ["Le président dépose sur le bureau : la feuille de présence, les pouvoirs, les comptes annuels de l'exercice [année] établis selon le SYSCOHADA révisé, le rapport de gestion, le rapport du commissaire aux comptes [le cas échéant] et le texte des résolutions. Ces documents ont été tenus à la disposition des actionnaires dans les délais légaux."]],
      ['Ordre du jour', ["Approbation des comptes de l'exercice clos le [date] et quitus aux dirigeants.", 'Affectation du résultat.', 'Approbation des conventions réglementées [le cas échéant].', 'Renouvellement ou nomination de [administrateurs / commissaire aux comptes].', 'Pouvoirs pour les formalités.']],
      ['Résolutions', [
        "Première résolution — L'assemblée, après avoir pris connaissance des rapports, approuve les comptes de l'exercice clos le [date] faisant apparaître un [bénéfice / une perte] de [montant] FCFA. Vote : pour [n], contre [n], abstentions [n].",
        'Deuxième résolution — L’assemblée décide d’affecter le résultat comme suit : réserve légale [montant] ; dividendes [montant] ; report à nouveau [montant]. Vote : [résultat].',
        'Troisième résolution — [Texte]. Vote : [résultat].',
        "Dernière résolution — L'assemblée confère tous pouvoirs au porteur d'une copie du présent procès-verbal pour accomplir les formalités légales.",
      ]],
      ['Clôture et signatures', ["Rien n'étant plus à l'ordre du jour, la séance est levée à [heure]. Le présent procès-verbal est signé par le président, les scrutateurs et le secrétaire.", 'Le président : [signature] — Les scrutateurs : [signatures] — Le secrétaire : [signature]']],
    ],
  },
  {
    slug: 'reglement-interieur-conseil',
    cat: 'gouvernance',
    title: "Règlement intérieur du conseil d'administration",
    short: 'Fixe le fonctionnement du conseil : réunions, information, comités, déontologie.',
    usage: 'Adopté par le conseil, il complète les statuts sans pouvoir y déroger. Il est remis à chaque nouvel administrateur.',
    sections: [
      ['Article 1 — Objet', ["Le présent règlement précise les modalités de fonctionnement du conseil d'administration de [dénomination], en complément des statuts et de l'AUSCGIE."]],
      ['Article 2 — Composition et administrateurs indépendants', ["Le conseil comprend [nombre] administrateurs, dont au moins [nombre] indépendants, c'est-à-dire sans lien d'intérêt avec la société, ses dirigeants ou ses actionnaires de référence. La qualité d'indépendant est revue chaque année."]],
      ['Article 3 — Réunions', ["Le conseil se réunit au moins [quatre] fois par an, sur convocation du président adressée [huit] jours à l'avance avec l'ordre du jour et les documents utiles. La participation par visioconférence est admise [sauf pour l'arrêté des comptes]."]],
      ['Article 4 — Information des administrateurs', ["Chaque administrateur reçoit les informations nécessaires à l'accomplissement de sa mission et peut demander tout document complémentaire au président. Un tableau de bord trimestriel (activité, trésorerie, risques) est présenté au conseil."]],
      ['Article 5 — Comités', ["Le conseil peut créer un comité d'audit et des risques et un comité des rémunérations, composés majoritairement d'administrateurs indépendants. Les comités préparent les décisions du conseil et lui rendent compte."]],
      ['Article 6 — Déontologie et conflits d’intérêts', ["Chaque administrateur agit dans l'intérêt social, déclare tout conflit d'intérêts, même potentiel, et s'abstient de participer aux délibérations correspondantes. Il respecte la confidentialité des informations reçues et les règles relatives aux informations privilégiées."]],
      ['Article 7 — Évaluation', ["Une fois par an, le conseil consacre un point de son ordre du jour à l'évaluation de son fonctionnement. Une évaluation externe est réalisée tous les [trois] ans."]],
      ['Article 8 — Modification', ["Le présent règlement peut être modifié par décision du conseil à la majorité de [fraction] des administrateurs présents ou représentés."]],
    ],
  },
];

export const MODELE_AVERTISSEMENT = AVERT;
