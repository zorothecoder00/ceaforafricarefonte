// Données de démonstration (fictives), reprises du prototype CEA FOR AFRICA.

export const COUNTRIES: Record<string, string>={TG:"Togo",CI:"Côte d'Ivoire",SN:"Sénégal",BJ:"Bénin",NG:"Nigeria",GH:"Ghana",CM:"Cameroun",KE:"Kenya",ZA:"Afrique du Sud",MA:"Maroc",EG:"Égypte",CD:"RD Congo",RW:"Rwanda",ET:"Éthiopie",ML:"Mali",BF:"Burkina Faso",GA:"Gabon"};

export const HUBS=[
 {c:"TG",lon:1.2,lat:6.1,m:4820,p:126,e:21,hq:true,city:"Lomé",lead:"Akossiwa Amegah"},{c:"CI",lon:-4,lat:5.3,m:3910,p:98,e:14,city:"Abidjan",lead:"Yao Kouamé"},{c:"SN",lon:-17.4,lat:14.7,m:2650,p:71,e:9,city:"Dakar",lead:"Awa Sarr"},
 {c:"BJ",lon:2.4,lat:6.4,m:1480,p:40,e:6,city:"Cotonou",lead:"Rodrigue Hounsa"},{c:"NG",lon:3.4,lat:6.5,m:5120,p:132,e:12,city:"Lagos",lead:"Tunde Bakare"},{c:"GH",lon:-0.2,lat:5.6,m:2210,p:58,e:8,city:"Accra",lead:"Efua Owusu"},
 {c:"CM",lon:9.7,lat:4.0,m:1960,p:47,e:7,city:"Douala",lead:"Paul Nkeng"},{c:"KE",lon:36.8,lat:-1.3,m:2780,p:69,e:10,city:"Nairobi",lead:"Achieng Otieno"},{c:"ZA",lon:28,lat:-26.2,m:1640,p:39,e:5,city:"Johannesburg",lead:"Lerato Dlamini"},
 {c:"MA",lon:-7.6,lat:33.6,m:1230,p:31,e:4,city:"Casablanca",lead:"Salma Idrissi"},{c:"EG",lon:31.2,lat:30,m:980,p:22,e:3,city:"Le Caire",lead:"Omar Fathy"},{c:"CD",lon:15.3,lat:-4.3,m:1350,p:33,e:4,city:"Kinshasa",lead:"Gloire Mbuyi"},
 {c:"RW",lon:30.1,lat:-1.9,m:870,p:25,e:6,city:"Kigali",lead:"Diane Uwase"},{c:"ET",lon:38.7,lat:9,m:640,p:14,e:2,city:"Addis-Abeba",lead:"Selam Bekele"},{c:"ML",lon:-8,lat:12.6,m:920,p:19,e:3,city:"Bamako",lead:"Oumar Keïta"},{c:"BF",lon:-1.5,lat:12.4,m:1050,p:24,e:4,city:"Ouagadougou",lead:"Aline Zongo"}
];

export const ICON: Record<string, string>={
 cap:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
 fund:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 1.8-3 .9-3 1.9 1.3 1.8 3 1.8 3-.8 3-1.8"/>',
 proj:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/>',
 event:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
 job:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
 circle:'<circle cx="12" cy="7" r="3"/><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/>',
 learn:'<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
 voice:'<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 gov:'<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3l9 5H3z"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
 doc:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
 mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
 press:'<path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 star:'<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M22 19c0-2.3-1.8-4.3-4.3-4.9"/>',
 chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 video:'<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
 tool:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
 book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
 chart:'<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
 shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 bank:'<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M12 3l9 5H3z"/>',
 leaf:'<path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16z"/><path d="M5 21l8-8"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
 pin:'<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
 rocket:'<path d="M5 15c-1 1-2 5-2 5s4-1 5-2M9 15l-3-3c1-4 5-9 12-9 0 7-5 11-9 12z"/><circle cx="15" cy="9" r="1.5"/>',
 lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
 swap:'<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
 bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
 hand:'<path d="M7 11V5a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v7a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3l-2-4a2 2 0 0 1 3.5-2L7 14"/>',
 // Icônes des menus latéraux (back-office, Mon espace)
 home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
 card:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 10h4M14 14h3"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
 toggle:'<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
 bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
 edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 list:'<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
 ticket:'<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',
 megaphone:'<path d="M3 11v2a1 1 0 0 0 1 1h2l7 5V5L6 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
 invoice:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
 form:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 check:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
 logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
 back:'<path d="M15 18l-6-6 6-6"/>'
};

export const DOMAINS=[
 {id:"actionnariat",ic:"cap",n:"CEA Actionnariat",dom:"Actionnariat",d:"Comprendre, ouvrir et partager le capital de son entreprise.",k:"Studio de capital et Club des actionnaires",to:"/actionnariat",pub:"Dirigeants de PME, fondateurs, salariés, épargnants",met:["Modules pédagogiques","Simulateur de dilution","Accompagnement à l'ouverture du capital","Club des actionnaires"],liv:["Table de capitalisation","Pacte d'associés type","Certificat « Actionnaire averti »"]},
 {id:"levee",ic:"fund",n:"CEA Kapital Invest",dom:"Levée de fonds",d:"Préparer sa levée et rencontrer des investisseurs qualifiés.",k:"Via CEA Kapital Invest",to:"/kapital",pub:"Start-up, PME en croissance, projets structurants",met:["Diagnostic Investor Ready","Programme de préparation","Data room","Comité et mise en relation"],liv:["Score de préparation","Dossier d'investissement","Présentation aux investisseurs"]},
 {id:"projets",ic:"proj",n:"CEA Project Studio",dom:"Développement de projets",d:"Structurer un projet finançable, du canvas au plan d'action.",k:"Project Studio",to:"/projets",pub:"Porteurs de projets, entreprises, partenaires, bailleurs",met:["Fiche projet normalisée","Canvas interactifs","Plan d'action et jalons","Modèle financier guidé"],liv:["Score de maturité","Rapports automatiques","Passage vers Kapital Invest"]},
 {id:"evenements",ic:"event",n:"CEA Events",dom:"Événements",d:"Forums, masterclass et rencontres d'affaires sur le continent.",k:"Forum panafricain le 26 novembre",to:"/evenements",pub:"Membres, investisseurs, sponsors, grand public",met:["Billetterie Mobile Money","Rencontres B2B","Diffusion en direct","Replays"],liv:["Billet QR","Certificat de participation","Contacts qualifiés"]},
 {id:"emploi",ic:"job",n:"CEA Talents",dom:"Création d'emplois",d:"Recruter des talents africains et mesurer les emplois créés.",k:"10 offres ouvertes",to:"/opportunites",pub:"Talents, recruteurs, entreprises membres",met:["Offres vérifiées","Matching par compétences","Espace recruteur","Mesure des emplois"],liv:["Embauches","Emplois créés et vérifiés"]},
 {id:"mastermind",ic:"circle",n:"CEA Mastermind Circles",dom:"Mastermind group",d:"Des cercles confidentiels de 8 à 12 dirigeants qui s'entraident.",k:"14 cercles actifs",to:"/communaute/mastermind",pub:"Dirigeants et fondateurs, par stade et secteur",met:["Admission et composition","Séances mensuelles guidées","Engagements trimestriels"],liv:["Plan de progression","Réseau de pairs"]},
 {id:"formation",ic:"learn",n:"CEA Academy & Accelerator",dom:"Accompagnement et formation",d:"Cours certifiants, mentorat et programmes d'accélération.",k:"8 cours en ligne",to:"/academie",pub:"Porteurs d'idées, entrepreneurs, PME, jeunes, femmes",met:["CEA Academy","Mentorat","Incubation et accélération","Experts à la demande"],liv:["Certificats vérifiables","Plan d'accompagnement","Demo Day"]},
 {id:"syndicat",ic:"voice",n:"CEA Voix des Entrepreneurs",dom:"Action syndicale",d:"Porter la voix des entrepreneurs auprès des décideurs.",k:"3 consultations ouvertes",to:"/voix",pub:"Adhérents, organisations professionnelles, décideurs",met:["Consultations","Propositions","Baromètre","Groupes de travail"],liv:["Positions publiées","Suivi des engagements obtenus"]}
,
 {id:"btp",ic:"bank",n:"CEA BTP & Infrastructures",dom:"BTP et infrastructures",d:"Construction, travaux publics, habitat et infrastructures : projets, marchés et partenaires.",k:"Projets, marchés, partenaires",to:"/domaines/btp",pub:"Entreprises du BTP, promoteurs, artisans, bureaux d'études, collectivités",met:["Identification et structuration des projets","Accès aux appels d'offres et aux marchés","Mise en relation avec financeurs et partenaires techniques","Formation : normes, sécurité, gestion de chantier"],liv:["Dossiers de projets bancables","Veille des appels d'offres","Réseau de partenaires BTP"]}
];

export const COURSES=[
 {id:"c1",t:"Créer son entreprise dans l'espace OHADA",th:"Création",lv:"Débutant",dur:"2 h 10",price:0,by:"Me Afi Mensah",ls:["Choisir sa forme juridique","Immatriculer au RCCM","Fiscalité de départ","Premiers contrats","Quiz final"]},
 {id:"c2",t:"Construire un modèle financier qui convainc",th:"Finance",lv:"Intermédiaire",dur:"3 h 40",price:15000,by:"Kwesi Boateng, CFA",ls:["Les hypothèses clés","Compte de résultat","Trésorerie","Besoin de financement","Quiz final"]},
 {id:"c3",t:"Pitcher devant des investisseurs",th:"Levée de fonds",lv:"Intermédiaire",dur:"1 h 50",price:0,by:"Aminata Diallo",ls:["La structure d'un pitch","Raconter la traction","Valorisation : bases","Répondre aux objections","Quiz final"]},
 {id:"c4",t:"Vendre dans toute l'Afrique avec la ZLECAf",th:"Export",lv:"Avancé",dur:"2 h 30",price:20000,by:"Dr. Chinedu Okafor",ls:["Ce que change la ZLECAf","Règles d'origine","Logistique transfrontalière","Paiements panafricains","Quiz final"]},
 {id:"c5",t:"Marketing digital à petit budget",th:"Marketing",lv:"Débutant",dur:"1 h 30",price:0,by:"Grace Wanjiru",ls:["Connaître son client","WhatsApp Business","Réseaux sociaux","Mesurer ses résultats","Quiz final"]},
 {id:"c6",t:"Ouvrir le capital de sa PME",th:"Actionnariat",lv:"Intermédiaire",dur:"2 h",price:10000,by:"Jean-Baptiste Kouassi",ls:["Pourquoi ouvrir son capital","Pacte d'associés","Dilution et contrôle","Gouvernance","Quiz final"]},
 {id:"c7",t:"Recruter et fidéliser ses premiers salariés",th:"Gestion",lv:"Débutant",dur:"1 h 45",price:0,by:"Fatoumata Bah",ls:["Définir le poste","Recruter sans se tromper","Contrats et obligations","Fidéliser","Quiz final"]},
 {id:"c8",t:"Comprendre la bourse BRVM",th:"Finance",lv:"Débutant",dur:"1 h 20",price:0,by:"Serge Adjovi",ls:["Qu'est-ce qu'une action ?","Fonctionnement de la BRVM","Le rôle des SGI","Lire une cotation","Quiz final"]}
];

export const PATHS=[{id:"pa1",t:"Parcours « Entrepreneur certifié »",c:["c1","c5","c7","c2"],d:"Les bases pour créer et gérer une entreprise viable."},{id:"pa2",t:"Parcours « Prêt à lever »",c:["c2","c3","c6"],d:"Tout pour préparer une levée de fonds sérieuse."},{id:"pa3",t:"Parcours « Investisseur averti »",c:["c8","c6"],d:"Comprendre l'actionnariat et la bourse."}];

export const MASTERCLASS=[{t:"Bâtir une marque africaine mondiale",by:"Fondatrice d'une marque de cosmétiques présente dans 12 pays",dur:"48 min"},{t:"De 0 à 1 million d'utilisateurs en Afrique",by:"Co-fondateur d'une fintech panafricaine",dur:"55 min"},{t:"Gouverner une PME familiale",by:"Président d'un groupe agro-industriel",dur:"42 min"}];

export const EXPERTS=[{n:"Me Afi Mensah",x:"Droit des sociétés OHADA",p:25000},{n:"Kwesi Boateng",x:"Modélisation financière",p:30000},{n:"Grace Wanjiru",x:"Marketing digital",p:20000},{n:"Ibrahima Sow",x:"Fiscalité UEMOA",p:25000}];

export const EVENTS=[
 {id:"e1",t:"Forum panafricain CEA 2026",city:"Lomé",c:"TG",date:"2026-11-26",fmt:"Hybride",big:true,d:"Trois jours pour connecter entrepreneurs, investisseurs et décideurs du continent : plénières, ateliers, Demo Day et rencontres B2B.",sp:["Dirigeants de PME","Fonds africains","Bailleurs","Ministres invités"],tk:[{n:"Pass entrepreneur",p:25000},{n:"Pass investisseur",p:75000},{n:"Accès en ligne",p:0}]},
 {id:"e2",t:"Masterclass : lever son premier million",city:"Abidjan",c:"CI",date:"2026-10-17",fmt:"Présentiel",d:"Une demi-journée avec trois fondateurs qui ont levé plus d'un million de dollars.",sp:["Fondateurs","Business angels"],tk:[{n:"Entrée",p:10000}]},
 {id:"e3",t:"Rencontres investisseurs — Agritech",city:"En ligne",c:"KE",date:"2026-10-29",fmt:"En ligne",d:"Dix start-up agritech présentent leur projet à un panel d'investisseurs. Organisé avec CEA Kapital Invest.",sp:["Fonds agritech","Analystes CEA"],tk:[{n:"Accès en ligne",p:0}]},
 {id:"e4",t:"Atelier : WhatsApp Business pour vendre plus",city:"Dakar",c:"SN",date:"2026-11-07",fmt:"Présentiel",d:"Atelier pratique de trois heures, venez avec votre téléphone.",sp:["Experts marketing"],tk:[{n:"Entrée",p:5000}]},
 {id:"e5",t:"Cercle des femmes entrepreneures",city:"Lagos",c:"NG",date:"2026-12-05",fmt:"Présentiel",d:"Rencontre et mentorat entre dirigeantes, suivie d'un dîner de réseautage.",sp:["Dirigeantes","Mentors"],tk:[{n:"Entrée",p:15000}]}
];

export const REPLAYS=[{t:"Forum 2025 — Plénière : financer la croissance africaine",d:"1 h 32",ch:["Ouverture","État du capital-risque africain","Table ronde des fonds","Questions du public"],v:"12 400"},{t:"Masterclass : négocier sa valorisation",d:"58 min",ch:["Méthodes de valorisation","Erreurs fréquentes","Étude de cas"],v:"8 900"},{t:"Atelier ZLECAf : exporter vers le Ghana",d:"1 h 05",ch:["Règles d'origine","Douane","Paiements"],v:"5 300"}];

export const JOBS=[
 {id:"j1",t:"Responsable commercial·e Afrique de l'Ouest",co:"AgroSahel SA",c:"SN",type:"CDI",remote:false,sal:"900 000 – 1 200 000 FCFA",skills:["Vente B2B","Négociation","Anglais"]},
 {id:"j2",t:"Développeur·se mobile Flutter",co:"PayLink Africa",c:"GH",type:"CDI",remote:true,sal:"Selon profil",skills:["Flutter","API REST","Mobile Money"]},
 {id:"j3",t:"Stage — analyste financier",co:"CEA Kapital Invest",c:"TG",type:"Stage",remote:false,sal:"150 000 FCFA",skills:["Excel","Modélisation","Rédaction"]},
 {id:"j4",t:"Chef·fe de projet énergie solaire",co:"SunVolt Energy",c:"KE",type:"CDD",remote:false,sal:"Selon profil",skills:["Gestion de projet","Énergie","Kiswahili"]},
 {id:"j5",t:"Community manager bilingue",co:"Kente Studio",c:"CI",type:"Freelance",remote:true,sal:"Mission de 3 mois",skills:["Réseaux sociaux","Rédaction","Anglais"]},
 {id:"j6",t:"Comptable confirmé·e SYSCOHADA",co:"BatiPlus",c:"BJ",type:"CDI",remote:false,sal:"500 000 – 700 000 FCFA",skills:["SYSCOHADA","Fiscalité","Paie"]},
 {id:"j7",t:"Responsable logistique",co:"TransAfrik Cargo",c:"NG",type:"CDI",remote:false,sal:"Selon profil",skills:["Supply chain","Douane","Excel"]},
 {id:"j8",t:"Data analyst",co:"Mobilis Health",c:"RW",type:"CDI",remote:true,sal:"Selon profil",skills:["SQL","Python","Visualisation"],diaspora:true},
 {id:"j9",t:"Stage — chargé·e d'événements",co:"CEA FOR AFRICA",c:"TG",type:"Stage",remote:false,sal:"120 000 FCFA",skills:["Organisation","Communication"]},
 {id:"j10",t:"Consultant·e en structuration de projets",co:"CEA Project Studio",c:"CM",type:"Mission",remote:true,sal:"Mission de 6 mois",skills:["Cadre logique","Finance","Rédaction"],diaspora:true}
];

export const TENDERS=[{t:"Étude de marché agro-transformation — 3 pays",org:"Programme CEA × bailleur",c:"Régional",close:"2026-10-31",b:"25 M FCFA"},{t:"Formation de 200 jeunes au numérique",org:"CEA Academy",c:"TG",close:"2026-11-12",b:"40 M FCFA"},{t:"Prestataire événementiel Forum 2026",org:"CEA Events",c:"TG",close:"2026-10-20",b:"Sur devis"}];

export const SKILLCALLS=[{p:"Manioc+",need:"Directeur·rice financier·e associé·e",c:"TG"},{p:"SolarVillage",need:"Expert·e en financement carbone",c:"KE"},{p:"EduMobile",need:"Développeur·se React Native",c:"SN"}];

export const COMPANIES=[{n:"PayLink Africa",s:"Fintech",c:"GH",d:"Paiements Mobile Money pour les commerçants.",j:1},{n:"AgroSahel SA",s:"Agroalimentaire",c:"SN",d:"Transformation de céréales locales.",j:1},{n:"SunVolt Energy",s:"Énergie",c:"KE",d:"Kits solaires pour les foyers ruraux.",j:1},{n:"Mobilis Health",s:"Santé",c:"RW",d:"Dossier médical mobile.",j:1}];

export const MEMBERS=[
 {n:"Aïcha Agbodjan",c:"TG",s:"Agroalimentaire",r:"Entrepreneure",b:["Vérifiée","Alumni"],need:"Distributeur au Ghana",offer:"Conseils en transformation du manioc"},
 {n:"Kwame Asante",c:"GH",s:"Fintech",r:"Fondateur",b:["Vérifié"],need:"Mentor en levée de fonds",offer:"Intégration Mobile Money"},
 {n:"Fatou Ndiaye",c:"SN",s:"Agroalimentaire",r:"Dirigeante de PME",b:["Vérifiée","Mastermind"],need:"Investisseur pour une 2e usine",offer:"Retour d'expérience export"},
 {n:"Ngozi Eze",c:"NG",s:"Finance",r:"Mentor",b:["Mentor","Vérifiée"],need:"—",offer:"Préparation à la levée, modèle financier"},
 {n:"Jean-Marc Ekotto",c:"CM",s:"Investissement",r:"Business angel",b:["Investisseur vérifié"],need:"Start-up santé et éducation",offer:"Tickets de 20 000 à 100 000 USD"},
 {n:"Wanjiru Kamau",c:"KE",s:"Énergie",r:"Fondatrice",b:["Vérifiée"],need:"Partenaires en Afrique de l'Ouest",offer:"Expertise solaire hors réseau"},
 {n:"Youssef Benali",c:"MA",s:"Logistique",r:"Dirigeant",b:["Vérifié"],need:"Transporteurs au Sahel",offer:"Entrepôts à Casablanca"},
 {n:"Esther Mukamana",c:"RW",s:"Santé",r:"Fondatrice",b:["Vérifiée","Alumni"],need:"Développeur·se backend",offer:"Accès aux cliniques partenaires"},
 {n:"Koffi Mensah",c:"BJ",s:"BTP",r:"Dirigeant de PME",b:["Mastermind"],need:"Comptable SYSCOHADA",offer:"Sous-traitance chantier"},
 {n:"Mariam Traoré",c:"ML",s:"Textile",r:"Créatrice",b:["Vérifiée"],need:"Marché à l'export",offer:"Tissage bogolan sur mesure"},
 {n:"Thabo Nkosi",c:"ZA",s:"Numérique",r:"Mentor",b:["Mentor"],need:"—",offer:"Scaling SaaS, recrutement tech"},
 {n:"Salif Ouédraogo",c:"BF",s:"Agriculture",r:"Entrepreneur",b:["Vérifié"],need:"Financement de matériel",offer:"Coopérative de 300 producteurs"}
];

export const MENTORS=[{n:"Ngozi Eze",c:"NG",x:"Levée de fonds, modèle financier",lang:"Anglais, français",rate:4.9},{n:"Thabo Nkosi",c:"ZA",x:"Croissance SaaS, recrutement",lang:"Anglais",rate:4.8},{n:"Aminata Diallo",c:"SN",x:"Pitch, communication",lang:"Français, wolof",rate:4.9},{n:"Serge Adjovi",c:"BJ",x:"Bourse, gouvernance",lang:"Français",rate:4.7}];

export const SPACES=[{n:"Agritech Afrique",m:1840,d:"Innovation agricole, transformation, accès aux marchés"},{n:"Femmes entrepreneures",m:3120,d:"Entraide, mentorat et opportunités entre dirigeantes"},{n:"Diaspora Connect",m:1290,d:"Investir et entreprendre depuis l'étranger"},{n:"Fintech & paiements",m:960,d:"Mobile Money, réglementation, partenariats"},{n:"CEA Togo",m:4820,d:"L'espace des membres au Togo"},{n:"Jeunes entrepreneurs",m:2750,d:"Moins de 30 ans, premiers pas"}];

export const FEED=[{a:"Fatou Ndiaye",t:"Nous venons d'obtenir la certification export vers le Ghana grâce au module ZLECAf. Merci à la communauté !",l:42,sp:"Agritech Afrique"},{a:"CEA Kapital Invest",t:"12 entreprises ont été déclarées « Prêtes pour présentation » ce mois-ci. Les investisseurs vérifiés peuvent consulter les nouvelles opportunités.",l:88,sp:"Annonce",k:true},{a:"Kwame Asante",t:"Qui a de l'expérience avec la réglementation Mobile Money au Sénégal ? Je cherche un retour d'expérience.",l:15,sp:"Fintech & paiements"}];

export const CONSULTS=[
 {id:"v1",t:"Quelle doit être la priorité de plaidoyer 2027 ?",c:"Tous pays",close:"2026-11-30",o:[["Délais de paiement des marchés publics",412],["Accès au crédit bancaire des PME",538],["Fiscalité des jeunes entreprises",377],["Coût de l'énergie",264]]},
 {id:"v2",t:"Faut-il un guichet unique de l'export ZLECAf par pays ?",c:"Tous pays",close:"2026-11-15",o:[["Oui, indispensable",623],["Oui, mais en ligne seulement",281],["Non, priorité ailleurs",74]]},
 {id:"v3",t:"Votre principale difficulté avec l'administration fiscale au Togo",c:"Togo",close:"2026-10-31",o:[["Complexité des déclarations",146],["Contrôles imprévisibles",98],["Délais de remboursement de TVA",121]]}
];

export const POSITIONS=[{t:"Pour un plafonnement à 60 jours des délais de paiement publics",d:"2026-09-12",p:"Togo, Bénin"},{t:"Note : l'accès des PME aux marchés de capitaux de l'UEMOA",d:"2026-07-03",p:"UEMOA"},{t:"Lettre ouverte sur le coût de l'énergie pour les PME industrielles",d:"2026-05-21",p:"Sénégal"}];

export const WGROUPS=["Fiscalité","Financement","Énergie","Commerce intra-africain","Numérique"];

export const ARTICLES=[
 {id:"a1",t:"Capital-risque en Afrique : ce qui change en 2026",cat:"Analyse",c:"Panafricain",d:"2026-09-24",r:"6 min",x:"Les fonds africains se tournent vers les entreprises rentables et les financements mixtes. Ce que cela implique pour les fondateurs qui préparent une levée.",k:true},
 {id:"a2",t:"Comment Aïcha a triplé sa production de gari en 18 mois",cat:"Histoire d'entrepreneur",c:"Togo",d:"2026-09-18",r:"4 min",x:"De la cuisine familiale à une unité de transformation de 46 salariés : un parcours accompagné par CEA."},
 {id:"a3",t:"ZLECAf : les règles d'origine expliquées simplement",cat:"Guide",c:"Panafricain",d:"2026-09-10",r:"8 min",x:"Pour bénéficier des droits de douane réduits, vos produits doivent respecter les règles d'origine. Voici comment les lire."},
 {id:"a4",t:"Communiqué : lancement de CEA Kapital Invest",cat:"Communiqué",c:"Panafricain",d:"2026-09-01",r:"2 min",x:"CEA FOR AFRICA lance son portail financier dédié à la levée de fonds et à l'accès aux marchés de capitaux africains.",k:true},
 {id:"a5",t:"BRVM : comprendre les introductions en bourse des PME",cat:"Analyse",c:"UEMOA",d:"2026-08-27",r:"7 min",x:"Le compartiment des PME ouvre une voie de financement encore peu utilisée. Conditions, coûts et calendrier.",k:true}
];

export const STUDIES=[{t:"Baromètre de la levée de fonds en Afrique — S1 2026",y:"2026"},{t:"Rapport d'impact annuel CEA 2025",y:"2026"},{t:"L'emploi dans les PME accompagnées : étude de suivi à 12 mois",y:"2025"}];

export const PODCASTS=[{t:"Ép. 24 — Lever des fonds sans perdre le contrôle",d:"38 min"},{t:"Ép. 23 — Exporter au Nigeria depuis la zone UEMOA",d:"31 min"},{t:"Ép. 22 — Les femmes qui financent l'Afrique",d:"44 min"}];

export const TOOLS=[{t:"Modèle de business plan",f:"DOCX"},{t:"Modèle financier sur 5 ans",f:"XLSX"},{t:"Pacte d'associés type (à adapter)",f:"DOCX"},{t:"Modèle de pitch deck",f:"PPTX"},{t:"Grille de diagnostic de maturité",f:"PDF"},{t:"Contrat de travail type (Togo)",f:"DOCX"}];

export const GLOSS=[["Action","Part du capital d'une société, qui donne des droits (vote, dividendes)."],["BRVM","Bourse régionale des valeurs mobilières, commune aux 8 pays de l'UEMOA, à Abidjan."],["Cap table","Table de capitalisation : qui détient quel pourcentage de l'entreprise."],["Data room","Espace documentaire sécurisé utilisé lors d'une levée de fonds."],["Dilution","Baisse du pourcentage détenu par un associé quand de nouvelles actions sont émises."],["Due diligence","Vérifications menées par un investisseur avant d'investir."],["Investor Ready","Niveau de préparation permettant de présenter une entreprise aux investisseurs."],["KYC","Vérification de l'identité d'un client (Know Your Customer)."],["Obligation","Titre de dette : l'émetteur rembourse le capital et verse des intérêts."],["Post-money","Valorisation de l'entreprise juste après la levée."],["SAFE / BSA AIR","Instrument qui donne droit à des actions lors d'une levée future."],["SGI","Société de gestion et d'intermédiation, intermédiaire agréé sur la BRVM."],["Sukuk","Titre de financement conforme à la finance islamique."],["ZLECAf","Zone de libre-échange continentale africaine."]];

export const OPPS=[
 {id:"o1",n:"Projet « Manioc+ »",c:"TG",s:"Agro-industrie",st:"Croissance",need:350000000,inst:"Actions de préférence",tr:"CA 2025 : 420 M FCFA, +68 % sur un an",team:"3 associés, 46 salariés",ver:"Vérifié par CEA",use:"Seconde ligne de transformation, fonds de roulement",prog:62},
 {id:"o2",n:"Projet « PayLink »",c:"GH",s:"Fintech",st:"Amorçage",need:600000000,inst:"SAFE / BSA AIR",tr:"120 000 utilisateurs actifs, 2,1 M USD de volume mensuel",team:"4 fondateurs, 18 salariés",ver:"Vérifié par CEA",use:"Expansion en Côte d'Ivoire et au Sénégal",prog:41},
 {id:"o3",n:"Projet « SolarVillage »",c:"KE",s:"Énergie",st:"Série A",need:2400000000,inst:"Actions + dette",tr:"14 000 foyers équipés, taux de recouvrement 93 %",team:"2 fondateurs, 85 salariés",ver:"Diligence en cours",use:"30 000 nouveaux kits, entrée au Rwanda",prog:28},
 {id:"o4",n:"Projet « MediPass »",c:"RW",s:"Santé",st:"Amorçage",need:300000000,inst:"Obligations convertibles",tr:"62 cliniques partenaires",team:"3 fondateurs, 12 salariés",ver:"Vérifié par CEA",use:"Produit, conformité, recrutement",prog:77},
 {id:"o5",n:"Projet « BatiVert »",c:"CI",s:"BTP durable",st:"Croissance",need:900000000,inst:"Dette mezzanine",tr:"Carnet de commandes : 1,8 Md FCFA",team:"Dirigeante + 6 cadres",ver:"Déclaratif",use:"Usine de briques compressées",prog:15},
 {id:"o6",n:"Projet « EduMobile »",c:"SN",s:"Éducation",st:"Pré-amorçage",need:120000000,inst:"Actions ordinaires",tr:"Pilote dans 40 écoles",team:"2 fondateurs",ver:"Déclaratif",use:"Contenus en wolof et pulaar, développement",prog:9}
];

export const STOCKS=[{n:"Société Agro-Ivoire (fictive)",ex:"BRVM",s:"Agriculture",p:4250,ch:1.2,dy:6.1},{n:"TelcoWest (fictive)",ex:"BRVM",s:"Télécoms",p:18900,ch:-0.4,dy:7.3},{n:"Banque Sahel (fictive)",ex:"BRVM",s:"Banque",p:7400,ch:0.8,dy:8.0},{n:"CimAfrique (fictive)",ex:"NGX",s:"Industrie",p:3120,ch:2.1,dy:4.2},{n:"KenyaPower+ (fictive)",ex:"NSE",s:"Énergie",p:980,ch:-1.6,dy:3.5},{n:"Atlas Mines (fictive)",ex:"Casablanca",s:"Mines",p:5600,ch:0.3,dy:5.0},{n:"NileFoods (fictive)",ex:"EGX",s:"Agroalimentaire",p:2150,ch:1.9,dy:2.8},{n:"GoldCoast Bank (fictive)",ex:"GSE",s:"Banque",p:1450,ch:-0.2,dy:6.4}];

export const FINCAL=[{d:"2026-10-08",t:"Résultats T3 — Banque Sahel (fictive)",ex:"BRVM"},{d:"2026-10-15",t:"Détachement de dividende — TelcoWest (fictive)",ex:"BRVM"},{d:"2026-10-22",t:"Introduction en bourse — AgroPlus (fictive)",ex:"BRVM"},{d:"2026-11-03",t:"Assemblée générale — CimAfrique (fictive)",ex:"NGX"},{d:"2026-11-19",t:"Émission obligataire — État (fictif) 6,25 % 2026-2033",ex:"BRVM"}];

export const BONDS=[{e:"État A (fictif)",m:"150 Md FCFA",r:6.25,mat:"2033",ex:"BRVM",type:"Souverain"},{e:"Banque Régionale (fictive)",m:"25 Md FCFA",r:6.9,mat:"2031",ex:"BRVM",type:"Corporate"},{e:"Énergie Verte SA (fictive)",m:"10 Md FCFA",r:6.5,mat:"2032",ex:"BRVM",type:"Obligation verte"},{e:"Sukuk Infrastructures (fictif)",m:"80 Md FCFA",r:6.1,mat:"2034",ex:"BRVM",type:"Sukuk"},{e:"Mobile Finance Ltd (fictive)",m:"4 Md KES",r:12.5,mat:"2029",ex:"NSE",type:"Corporate"}];

export const RESEARCH=[{t:"Note de marché hebdomadaire — semaine 39",p:false},{t:"Secteur bancaire UEMOA : perspectives 2027",p:true},{t:"Valorisations des start-up africaines : repères 2026",p:true},{t:"Guide : choisir entre dette et capital",p:false}];

export const STAGES=["Reçu","Diagnostic","Préparation","Comité","Prêt"];

export const PROGS=[["Pré-incubation","3 mois","Valider son idée et son marché",false,"2027-02-01"],["Incubation","6 mois","Lancer et trouver ses premiers clients",false,"2027-03-01"],["Accélérateur — Cohorte 4","6 mois","Croître et préparer une levée",true,"2026-11-15"],["Investor Ready","10 semaines","Se préparer aux investisseurs, avec Kapital Invest",true,"2026-12-01"],["Femmes entrepreneures","4 mois","Programme dédié aux dirigeantes",false,"2027-01-15"],["Diaspora Connect","3 mois","Entreprendre ou investir depuis la diaspora",false,"2027-04-01"],["Agritech Sahel","6 mois","Programme sectoriel Mali, Burkina Faso, Sénégal",false,"2027-02-15"]];

export const AFRICA=[[-5.9,35.8],[-1,35.1],[3,36.8],[10.2,37.2],[11,35.2],[10.1,33.8],[12.5,32.9],[15.2,32.3],[19,30.4],[20.1,32.1],[23,32.6],[25.2,31.6],[29.9,31.2],[32.3,31.3],[34.2,31.2],[34.5,29.5],[32.6,29.9],[33.5,27.5],[35.6,23.9],[37.2,21],[37.3,19.6],[39.2,15.6],[43.3,12.5],[43.1,11.6],[45,10.4],[51.2,11.8],[51,10.4],[49,6],[46,2],[42,-1],[39.7,-4],[39.3,-6.8],[40.5,-10.5],[40.7,-14.5],[39.5,-16.5],[36.9,-17.9],[34.8,-19.8],[35.5,-23.8],[32.6,-25.9],[32.9,-28.8],[31,-29.9],[28,-33],[25.6,-34],[20,-34.8],[18.4,-34.2],[18.2,-32],[16.5,-28.6],[15.2,-26.6],[14.5,-22.9],[11.8,-17.3],[12.3,-13.5],[13.2,-8.8],[12.3,-6],[11.8,-4.8],[9.3,-0.7],[9.4,0.4],[9.7,3.8],[8.5,4.6],[6,4.3],[3.4,6.4],[1.2,6.1],[-0.2,5.6],[-2,4.7],[-4,5.3],[-7.5,4.4],[-10.8,6.3],[-13.2,8.5],[-15,10.8],[-16.7,12.5],[-17.5,14.7],[-16.5,16.5],[-16,18.1],[-17,21],[-14.9,24],[-13.2,27.6],[-9.8,29.5],[-9.6,30.4],[-9.8,32],[-7.6,33.6],[-6.8,34]];

export const MADA=[[49.3,-12],[50.4,-15.5],[49.5,-17.8],[48.5,-21],[47.1,-24.9],[45.1,-25.5],[43.7,-23.4],[44,-20],[44.4,-16.2],[46.3,-15.7],[48,-13.5]];

export const MENU=[
 {k:"apropos",l:"À propos",cols:[{h:"L'organisation",items:[["/a-propos","info","Qui sommes-nous","Vision, mission, valeurs, histoire"],["/a-propos/gouvernance","gov","Gouvernance","Conseil, comités, équipe, experts"],["/a-propos/transparence","shield","Transparence","Rapports annuels et politiques"]]},{h:"Partout en Afrique",items:[["/pays","globe","Présence en Afrique","16 pays, une page par antenne"],["/a-propos/presse","press","Presse","Communiqués et kit média"],["/a-propos/carrieres","job","Carrières chez CEA","Rejoindre nos équipes"],["/contact","mail","Contact","Une équipe par pays et par sujet"]]}],feat:"kapital"},
 {k:"domaines",l:"Nos domaines",cols:[{h:"Se développer",items:[["/actionnariat","cap","Actionnariat","Studio de capital, Club des actionnaires"],["/kapital","fund","Levée de fonds","Via CEA Kapital Invest","Nouveau"],["/projets","proj","Développement de projets","Project Studio"],["/evenements","event","Événements","Forums et rencontres"]]},{h:"Grandir ensemble",items:[["/opportunites","job","Création d'emplois","CEA Talents"],["/communaute/mastermind","circle","Mastermind","Cercles de dirigeants"],["/academie","learn","Accompagnement et formation","Academy et Accelerator"],["/voix","voice","Action syndicale","Voix des entrepreneurs"]]}],feat:"quiz"},
 {k:"programmes",l:"Programmes",cols:[{h:"Nos programmes",items:[["/programmes","rocket","Tous les programmes","Pré-incubation à accélération"],["/programmes/accelerateur","star","Accélérateur — Cohorte 4","Candidatures ouvertes","Ouvert"],["/kapital/investor-ready","fund","Investor Ready","Se préparer aux investisseurs"]]},{h:"Suivre",items:[["/programmes/candidature","doc","Postuler","Candidature en 4 étapes"],["/programmes/calendrier","event","Calendrier des appels","Toutes les dates"],["/programmes/alumni","users","Alumni","Le réseau des anciens"]]}],feat:"call"},
 {k:"academie",l:"Académie",cols:[{h:"Apprendre",items:[["/academie","learn","Catalogue de cours","8 cours, 4 gratuits"],["/academie/parcours","star","Parcours certifiants","Certificats vérifiables"],["/academie/masterclass","video","Masterclass","Leçons de grands dirigeants"]]},{h:"Être accompagné",items:[["/communaute/mentorat","users","Mentorat","Réservez une séance"],["/academie/experts","tool","Experts à la demande","Consultations courtes"],["/espace/apprentissage","book","Mon apprentissage","Cours et certificats"]]}],feat:"kapital"},
 {k:"communaute",l:"Communauté",cols:[{h:"Le réseau",items:[["/adherer","hand","Adhérer","Formules et carte de membre"],["/communaute","users","Annuaire des membres","Trouver la bonne personne"],["/communaute/fil","chat","Fil d'actualité","Les nouvelles du réseau"],["/communaute/espaces","globe","Espaces thématiques","Par pays, secteur, profil"]]},{h:"Progresser",items:[["/communaute/mastermind","circle","Mastermind Circles","Cercles confidentiels"],["/communaute/mentorat","star","Mentorat","Mentors vérifiés"],["/communaute/messages","mail","Messagerie","Vos conversations"],["/voix","voice","Voix des entrepreneurs","Consultations et plaidoyer"]]}],feat:"event"},
 {k:"evenements",l:"Événements",cols:[{h:"Participer",items:[["/evenements","event","Agenda","Liste et calendrier"],["/evenements/e1","star","Forum panafricain CEA","26 – 28 novembre, Lomé","Billetterie"],["/evenements/live","video","En direct","Salle de diffusion"],["/evenements/replays","video","Replays","Vidéothèque chapitrée"]]},{h:"Organiser",items:[["/evenements/organiser","tool","Organiser avec nous","Sponsors, exposants, antennes"],["/evenements/scanner","shield","Contrôle d'accès","Scanner les billets (équipe)"]]}],feat:"event"},
 {k:"opps",l:"Opportunités",cols:[{h:"Trouver",items:[["/opportunites","job","Offres d'emploi et stages","10 offres vérifiées"],["/opportunites/missions","tool","Missions et consultants","Freelance et expertise"],["/opportunites/appels-offres","doc","Appels d'offres","Marchés et prestations"],["/projets/competences","proj","Projets à rejoindre","Appels à compétences"]]},{h:"Recruter",items:[["/opportunites/entreprises","bank","Entreprises qui recrutent","Pages employeurs"],["/opportunites/recruteur","users","Espace recruteur","Publier, trier, embaucher"],["/opportunites/profil","star","Mon profil talent","CV, compétences, visibilité"],["/opportunites/diaspora","globe","Diaspora","Contribuer depuis l'étranger"]]}],feat:"kapital"},
 {k:"ressources",l:"Ressources",cols:[{h:"S'informer",items:[["/ressources","press","Média et actualités","Analyses, histoires, communiqués"],["/ressources/etudes","chart","Études et rapports","Baromètres, rapports d'impact"],["/ressources/podcasts","mic","Podcasts et vidéos","Écouter, regarder"]]},{h:"Outils et données",items:[["/ressources/outils","tool","Boîte à outils","Modèles à télécharger"],["/impact","globe","Observatoire d'impact","Données sourcées et ouvertes"],["/ressources/glossaire","book","Glossaire","Les mots de l'entrepreneuriat"]]}],feat:"kapital"}
];

export const KMENU=[
 {k:"lever",l:"Lever des fonds",cols:[{h:"Se préparer",items:[["/kapital/diagnostic","chart","Suis-je prêt ?","Diagnostic gratuit en 8 questions"],["/kapital/investor-ready","star","Programme Investor Ready","10 semaines en cohorte"],["/kapital/ressources","book","Guides et modèles","Pitch, valorisation, data room"]]},{h:"Lever",items:[["/kapital/soumettre","doc","Soumettre mon dossier","Suivi en temps réel"],["/kapital/entreprise","proj","Mon espace entreprise","Data room, mises à jour investisseurs"]]}]},
 {k:"investir",l:"Investir",cols:[{h:"Opportunités",items:[["/kapital/opportunites","fund","Opportunités","Dossiers vérifiés par CEA"],["/kapital/syndicats","users","Clubs et syndicats","Co-investir à plusieurs"],["/kapital/diaspora","globe","Diaspora Invest","Investir dans son pays d'origine"]]},{h:"Mon compte",items:[["/kapital/devenir-investisseur","shield","Devenir investisseur","Vérification d'identité et profil"],["/kapital/investisseur","chart","Mon espace investisseur","Suivi, data rooms, portefeuille"]]}]},
 {k:"vc",l:"Capital-risque",cols:[{h:"CEA Kapital Ventures",items:[["/kapital/capital-risque","rocket","Notre approche","Thèse, critères, équipe"],["/kapital/capital-risque#portefeuille","star","Portefeuille","Entreprises accompagnées"],["/kapital/fonds","bank","Fonds et véhicules","Réservé aux investisseurs éligibles"]]},{h:"Partenaires",items:[["/kapital/lp","bank","Portail des souscripteurs","Appels de fonds, valeur liquidative"],["/kapital/proposer-deal","hand","Proposer un deal","Fondateurs, angels, fonds"]]}]},
 {k:"actions",l:"Actions",cols:[{h:"Émetteurs",items:[["/kapital/actions","cap","Ouvrir son capital","Préparer une émission d'actions"]]},{h:"Investisseurs",items:[["/kapital/actions#prive","lock","Marché privé des actions","Manifestations d'intérêt"],["/kapital/actions#secondaire","swap","Marché secondaire","Fenêtres de liquidité"],["/kapital/actions#populaire","users","Actionnariat populaire","Petits tickets, Mobile Money"]]}]},
 {k:"bourses",l:"Bourses africaines",cols:[{h:"Marchés",items:[["/kapital/marches","chart","Tableau des marchés","Indices, carte de chaleur"],["/kapital/bourses","bank","Fiches des bourses","BRVM, JSE, NGX, NSE…"],["/kapital/societes","doc","Sociétés cotées","Fiches et comparateur"]]},{h:"Suivre et apprendre",items:[["/kapital/calendrier","event","Calendrier financier","Résultats, dividendes, IPO"],["/kapital/suivi","bell","Ma liste de suivi","Valeurs suivies et alertes"],["/kapital/portefeuille-virtuel","star","Portefeuille virtuel","10 M FCFA fictifs pour s'entraîner"],["/academie/c8","learn","Apprendre la bourse","Cours gratuit BRVM"]]}]},
 {k:"capm",l:"Marché des capitaux",cols:[{h:"Se financer sur les marchés",items:[["/kapital/ipo-ready","rocket","IPO Ready","Feuille de route vers la cotation"],["/kapital/obligations","bank","Obligations et sukuk","Base des émissions, calculateur"]]},{h:"Analyses",items:[["/kapital/finance-verte","leaf","Finance verte et durable","Obligations vertes et sociales"],["/kapital/recherche","chart","Recherche et analyses","Notes de marché, baromètres"]]}]},
 {k:"confiance",l:"Confiance",cols:[{h:"Nos règles",items:[["/kapital/selection","search","Comment nous sélectionnons","Processus et comité"],["/kapital/risques","info","Risques de l'investissement","À lire avant d'investir"]]},{h:"Conformité",items:[["/kapital/conformite","shield","Conformité et réglementation","Régulateurs, ouverture par pays"],["/kapital/reclamations","mail","Réclamations","Signaler un problème"]]}]}
];

export const PRIV_OFFERS=[{id:"po1",n:"Manioc+ SA",c:"TG",price:12500,min:250000,max:350000000,raised:62,close:"2026-12-15"},{id:"po2",n:"MediPass Ltd",c:"RW",price:4800,min:500000,max:300000000,raised:77,close:"2026-11-30"}];

export const REG_FEATURES=[["kap_intro","Mise en relation privée avec des investisseurs qualifiés"],["kap_sub","Souscriptions et syndicats via partenaire agréé"],["kap_sec","Marché secondaire des actions non cotées"],["kap_pop","Actionnariat populaire (offre au public)"],["kap_ord","Ordres de bourse via SGI ou société de bourse partenaire"],["kap_lp","Portail des souscripteurs de fonds"],["vote","Vote électronique en assemblée"]];

export const FLAG0: Record<string, Record<string, boolean>>={TG:{kap_intro:true,vote:true},CI:{kap_intro:true},SN:{kap_intro:true},NG:{},KE:{},GH:{}};

export const PIPE0=[{id:"D-2026-0412",n:"Manioc+",c:"TG",st:"Prêt"},{id:"D-2026-0398",n:"PayLink",c:"GH",st:"Prêt"},{id:"D-2026-0455",n:"SolarVillage",c:"KE",st:"Comité"},{id:"D-2026-0461",n:"BatiVert",c:"CI",st:"Préparation"},{id:"D-2026-0470",n:"Kola Logistics",c:"NG",st:"Diagnostic"},{id:"D-2026-0473",n:"EduMobile",c:"SN",st:"Préparation"},{id:"D-2026-0480",n:"AquaPure",c:"BJ",st:"Reçu"},{id:"D-2026-0482",n:"Sahel Dairy",c:"BF",st:"Reçu"}];

