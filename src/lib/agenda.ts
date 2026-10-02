/* Ajout des rendez-vous à l'agenda personnel (CDC §10 « Agenda et rendez-vous ») :
   fichier iCalendar avec rappels intégrés (veille et 15 min avant), liens « Ajouter à Google Agenda / Outlook ».
   Les heures sont en UTC : chaque agenda les affiche dans le fuseau de l'utilisateur. */
import { createHmac } from 'node:crypto';
import { esc, fold, stamp } from './ics';
import { requireEnv } from './env';

export type Meeting = { uid: string; start: Date; minutes: number; title: string; description: string; location: string };

const end = (m: Meeting) => new Date(m.start.getTime() + m.minutes * 60000);

export function meetingIcs(m: Meeting) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CEA FOR AFRICA//Rendez-vous//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${m.uid}@cea4africa.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(m.start)}`, `DTEND:${stamp(end(m))}`,
    `SUMMARY:${esc(m.title)}`, `LOCATION:${esc(m.location)}`, `DESCRIPTION:${esc(m.description)}`,
    ...(/^https?:/.test(m.location) ? [`URL:${m.location}`] : []),
    ...[['P1D', 'demain'], ['PT15M', 'dans 15 minutes']].flatMap(([trigger, when]) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${m.title} ${when}`)}`, `TRIGGER:-${trigger}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n';
}

export const googleUrl = (m: Meeting) => 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
  action: 'TEMPLATE', text: m.title, dates: `${stamp(m.start)}/${stamp(end(m))}`, details: m.description, location: m.location,
});

export const outlookUrl = (m: Meeting) => 'https://outlook.live.com/calendar/0/deeplink/compose?' + new URLSearchParams({
  path: '/calendar/action/compose', rru: 'addevent', subject: m.title, startdt: m.start.toISOString(), enddt: end(m).toISOString(), body: m.description, location: m.location,
});

/** Clé du lien de téléchargement d'un rendez-vous pris sans compte (envoyé par e-mail). */
export const agendaKey = (ref: string) => createHmac('sha256', requireEnv('BETTER_AUTH_SECRET')).update('agenda:' + ref).digest('base64url').slice(0, 22);

/** Les trois liens à proposer à l'utilisateur. */
export const agendaLinks = (m: Meeting, icsPath: string, site: string) => ({ google: googleUrl(m), outlook: outlookUrl(m), ics: new URL(icsPath, site).href });

export const siteUrl = () => process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';

/* Rendez-vous avec une équipe CEA (table appointment) et séances de mentorat : mêmes durées et liens de visio que l'interface. */
export const appointmentMeeting = (a: { reference: string; team: string; at: Date; topic: string | null; visio: string }): Meeting => ({
  uid: a.reference, start: a.at, minutes: 30, title: `Rendez-vous CEA — ${a.team}`, location: a.visio,
  description: `Rendez-vous en visio avec ${a.team}.\nLien : ${a.visio}\nRéférence : ${a.reference}${a.topic ? `\n\nSujet : ${a.topic}` : ''}`,
});

export const mentoringVisio = (id: string) => `https://meet.jit.si/CEA-${id.slice(0, 8)}`;
export const mentoringMeeting = (s: { id: string; kind: string; startsAt: Date; goal: string | null }, other: string): Meeting => ({
  uid: `mentorat-${s.id}`, start: s.startsAt, minutes: 60, title: `${s.kind === 'expert' ? 'Consultation' : 'Mentorat'} CEA avec ${other}`, location: mentoringVisio(s.id),
  description: `Séance ${s.kind === 'expert' ? 'de consultation' : 'de mentorat'} avec ${other}.\nVisio : ${mentoringVisio(s.id)}${s.goal ? `\n\nObjectif : ${s.goal}` : ''}\n\nVotre espace : ${siteUrl()}/espace`,
});
