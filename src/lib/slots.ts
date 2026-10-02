/* Créneaux de mentorat : disponibilités hebdomadaires → créneaux datés des 14 prochains jours (heure locale du mentor). */
export type WeeklySlot = { day: number; time: string }; // day : 0 = dimanche … 6 = samedi ; time : « HH:MM »

export function upcomingSlots(weekly: WeeklySlot[], taken: Date[], days = 14): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  const now = new Date();
  for (let d = 1; d <= days; d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    for (const s of weekly.filter((w) => w.day === date.getDay())) {
      const [h, m] = s.time.split(':').map(Number);
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
      if (taken.some((t) => Math.abs(t.getTime() - at.getTime()) < 30 * 60000)) continue;
      const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}T${s.time}`;
      out.push({ iso, label: at.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + s.time });
    }
  }
  return out.slice(0, 8);
}
