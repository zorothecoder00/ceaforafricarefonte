/* Ajout à l'agenda (CDC §10) : fichier .ics avec rappels, liens Google et Outlook, clé des liens signés. */
import { describe, it, expect, beforeAll } from 'vitest';
import { meetingIcs, googleUrl, outlookUrl, agendaKey, appointmentMeeting } from '../src/lib/agenda';

const m = appointmentMeeting({ reference: 'RDV-2026-ABC123', team: 'Équipe Kapital', at: new Date('2026-10-05T10:00:00Z'), topic: 'Levée, série A', visio: 'https://meet.jit.si/CEA-RDV-x' });

beforeAll(() => { process.env.BETTER_AUTH_SECRET ??= 'secret-de-test'; });

describe('meetingIcs', () => {
  const ics = meetingIcs(m);
  it('produit un événement en UTC de 30 minutes', () => {
    expect(ics).toContain('DTSTART:20261005T100000Z');
    expect(ics).toContain('DTEND:20261005T103000Z');
    expect(ics).toContain('UID:RDV-2026-ABC123@cea4africa.com');
  });
  it('inclut les rappels la veille et 15 minutes avant', () => {
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
  });
  it('échappe les virgules et respecte les fins de ligne CRLF', () => {
    expect(ics.replace(/\r\n /g, '')).toContain('Levée\\, série A');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

describe('liens agenda', () => {
  it('Google : dates de début et de fin', () => {
    expect(new URL(googleUrl(m)).searchParams.get('dates')).toBe('20261005T100000Z/20261005T103000Z');
  });
  it('Outlook : dates ISO', () => {
    const u = new URL(outlookUrl(m));
    expect(u.searchParams.get('startdt')).toBe('2026-10-05T10:00:00.000Z');
    expect(u.searchParams.get('enddt')).toBe('2026-10-05T10:30:00.000Z');
  });
  it('clé stable par référence et différente d’une référence à l’autre', () => {
    expect(agendaKey('RDV-1')).toBe(agendaKey('RDV-1'));
    expect(agendaKey('RDV-1')).not.toBe(agendaKey('RDV-2'));
  });
});
