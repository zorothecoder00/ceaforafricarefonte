/* Export iCalendar (RFC 5545) des événements CEA : fichier par événement et flux d'abonnement /evenements.ics (CDC §7.3).
   Heures « flottantes » : l'heure locale du lieu de l'événement, sans conversion de fuseau. */
import { EXTRA } from '../data/events-extra';

type Ev = { id: string; t: string; d: string; date: string; city: string; path?: string };

export const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lignes de 75 octets maximum, continuées par une espace (RFC 5545 §3.1)
export const fold = (line: string) => {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
};
export const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function vevent(e: Ev, site: string) {
  const x = EXTRA[e.id];
  const time = x?.time ?? '09:00';
  const days = Math.max(1, ...(x?.sessions.map((s) => s.day) ?? [1]));
  const start = `${e.date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const endDate = new Date(`${e.date}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + days - 1);
  const end = `${endDate.toISOString().slice(0, 10).replace(/-/g, '')}T${days > 1 ? '180000' : String(Math.min(23, Number(time.slice(0, 2)) + 3)).padStart(2, '0') + time.slice(3) + '00'}`;
  return [
    'BEGIN:VEVENT', `UID:${e.id}@cea4africa.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${esc(e.t)}`, `LOCATION:${esc(x?.venue ? `${x.venue.name}, ${x.venue.address}` : e.city)}`,
    `DESCRIPTION:${esc(`${e.d}\n${site}${e.path ?? `/evenements/${e.id}`}`)}`, `URL:${site}${e.path ?? `/evenements/${e.id}`}`, 'END:VEVENT',
  ];
}

export function calendar(events: Ev[], site = 'https://cea4africa.com', name = 'Événements CEA FOR AFRICA') {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CEA FOR AFRICA//Evenements//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D',
    ...events.flatMap((e) => vevent(e, site)), 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n';
}
