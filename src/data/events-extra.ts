/* Compléments des fiches événements (lieu, programme, intervenants, sponsors…). Données de démonstration. */
export type Session = { day: number; time: string; title: string; room: string; theme: string; speakers: string[] };
export type EventExtra = {
  venue: { name: string; address: string; lat: number; lon: number } | null;
  time: string;
  sessions: Session[];
  speakers: { n: string; r: string; c: string }[];
  sponsors: { tier: string; n: string }[];
  practical?: { hotels: string[]; visa: string };
};

const FORUM: EventExtra = {
  venue: { name: 'Palais des Congrès de Lomé', address: 'Boulevard du 13 Janvier, Lomé, Togo', lat: 6.1307, lon: 1.2228 },
  time: '09:00',
  sessions: [
    { day: 1, time: '09:00', title: "Plénière d'ouverture : l'Afrique qui entreprend", room: 'Salle principale', theme: 'Plénière', speakers: ['Akossiwa Amegah', 'Ministre invité'] },
    { day: 1, time: '11:00', title: 'Financer la croissance des PME africaines', room: 'Salle principale', theme: 'Financement', speakers: ['Ngozi Eze', 'Jean-Marc Ekotto'] },
    { day: 1, time: '14:00', title: 'Atelier : préparer sa data room', room: 'Salle B', theme: 'Financement', speakers: ['Analyste Kapital'] },
    { day: 1, time: '16:00', title: 'Rencontres B2B (rendez-vous programmés)', room: 'Espace B2B', theme: 'Réseau', speakers: [] },
    { day: 2, time: '09:30', title: 'ZLECAf : vendre dans 54 pays', room: 'Salle principale', theme: 'Export', speakers: ['Dr. Chinedu Okafor'] },
    { day: 2, time: '11:30', title: 'Masterclass : bâtir une marque africaine mondiale', room: 'Salle B', theme: 'Marketing', speakers: ['Grace Wanjiru'] },
    { day: 2, time: '15:00', title: 'Rencontres investisseurs — sessions privées', room: 'Salons Kapital', theme: 'Financement', speakers: [] },
    { day: 2, time: '19:00', title: 'Soirée de réseautage', room: 'Jardins', theme: 'Réseau', speakers: [] },
    { day: 3, time: '10:00', title: 'Demo Day CEA Kapital Invest : 12 entreprises, 40 investisseurs', room: 'Salle principale', theme: 'Financement', speakers: ['Comité Kapital'] },
    { day: 3, time: '15:00', title: 'Remise des prix et clôture', room: 'Salle principale', theme: 'Plénière', speakers: ['Akossiwa Amegah'] },
  ],
  speakers: [
    { n: 'Akossiwa Amegah', r: 'Responsable CEA Togo', c: 'TG' }, { n: 'Ngozi Eze', r: 'Mentor, ancienne banquière', c: 'NG' },
    { n: 'Jean-Marc Ekotto', r: 'Business angel', c: 'CM' }, { n: 'Dr. Chinedu Okafor', r: 'Expert ZLECAf', c: 'NG' },
    { n: 'Grace Wanjiru', r: 'Experte marketing digital', c: 'KE' }, { n: 'Fatou Ndiaye', r: 'Dirigeante de PME', c: 'SN' },
  ],
  sponsors: [{ tier: 'Platine', n: 'Banque partenaire' }, { tier: 'Or', n: 'Opérateur mobile' }, { tier: 'Argent', n: 'Fondation' }, { tier: 'Partenaire', n: 'Université' }],
  practical: {
    hotels: ['Hôtels partenaires à 5–15 min du Palais des Congrès, tarifs négociés pour les participants', 'Navette gratuite depuis l’aéroport Gnassingbé Eyadéma les 25 et 26 novembre'],
    visa: 'Les ressortissants CEDEAO entrent sans visa. Les autres participants peuvent demander une lettre d’invitation officielle après l’achat du billet ; e-visa togolais disponible en ligne.',
  },
};

export const EXTRA: Record<string, EventExtra> = {
  e1: FORUM,
  e2: { venue: { name: 'Plateau Business Center', address: 'Avenue Chardy, Plateau, Abidjan', lat: 5.3237, lon: -4.0197 }, time: '09:00', sessions: [
    { day: 1, time: '09:00', title: 'Accueil et témoignages de fondateurs', room: 'Auditorium', theme: 'Financement', speakers: ['Fondateurs invités'] },
    { day: 1, time: '10:30', title: 'Négocier sa valorisation', room: 'Auditorium', theme: 'Financement', speakers: ['Aminata Diallo'] },
    { day: 1, time: '12:00', title: 'Questions-réponses', room: 'Auditorium', theme: 'Financement', speakers: [] },
  ], speakers: [{ n: 'Aminata Diallo', r: 'Coach pitch', c: 'SN' }], sponsors: [] },
  e3: { venue: null, time: '14:00', sessions: [
    { day: 1, time: '14:00', title: '10 pitchs agritech (5 minutes chacun)', room: 'En ligne', theme: 'Financement', speakers: [] },
    { day: 1, time: '15:30', title: 'Questions du panel investisseurs', room: 'En ligne', theme: 'Financement', speakers: ['Fonds agritech'] },
  ], speakers: [], sponsors: [] },
  e4: { venue: { name: 'Espace CEA Dakar', address: 'Rue Carnot, Dakar, Sénégal', lat: 14.6708, lon: -17.4381 }, time: '10:00', sessions: [
    { day: 1, time: '10:00', title: 'Configurer WhatsApp Business et son catalogue', room: 'Salle 1', theme: 'Marketing', speakers: ['Experts marketing'] },
  ], speakers: [], sponsors: [] },
  e5: { venue: { name: 'Victoria Island Hub', address: 'Adeola Odeku St, Lagos, Nigeria', lat: 6.4281, lon: 3.4219 }, time: '17:00', sessions: [
    { day: 1, time: '17:00', title: 'Mentorat entre dirigeantes', room: 'Salon', theme: 'Réseau', speakers: [] },
    { day: 1, time: '19:30', title: 'Dîner de réseautage', room: 'Terrasse', theme: 'Réseau', speakers: [] },
  ], speakers: [], sponsors: [] },
};
