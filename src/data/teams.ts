/* Équipes joignables en rendez-vous visio depuis la page Contact (CDC §6.2). */
/** Permanences hebdomadaires par équipe (heure de Lomé, UTC+0). */
export const TEAM_SLOTS: Record<string, { day: number; time: string }[]> = {
  'Équipe programmes': [{ day: 1, time: '10:00' }, { day: 2, time: '14:00' }, { day: 4, time: '11:30' }, { day: 5, time: '15:00' }],
  'Équipe Kapital Invest': [{ day: 2, time: '10:00' }, { day: 3, time: '15:00' }, { day: 4, time: '10:00' }],
  'Relations investisseurs': [{ day: 1, time: '15:00' }, { day: 3, time: '11:00' }],
  'Direction des partenariats': [{ day: 2, time: '11:00' }, { day: 4, time: '15:00' }],
  'Vie associative': [{ day: 1, time: '11:00' }, { day: 3, time: '14:00' }, { day: 5, time: '10:00' }],
};
