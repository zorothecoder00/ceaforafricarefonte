/* Export iCalendar des événements (CDC §7.3) : format RFC 5545 accepté par Google Agenda, Outlook et Apple Calendrier. */
import { describe, expect, it } from 'vitest';
import { calendar } from '../src/lib/ics';
import { EVENTS } from '../src/data/site';

describe('calendar()', () => {
  const ics = calendar(EVENTS, 'https://cea4africa.com');
  const lines = ics.split('\r\n');

  it('contient un VEVENT par événement, avec un identifiant stable', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(EVENTS.length);
    for (const e of EVENTS) expect(ics).toContain(`UID:${e.id}@cea4africa.com`);
  });

  it('utilise des fins de ligne CRLF et plie les lignes à 75 octets', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('échappe virgules, points-virgules et retours à la ligne', () => {
    const one = calendar([{ id: 'x', t: 'A, B; C', d: 'ligne 1\nligne 2', date: '2026-01-01', city: 'Lomé' }]);
    expect(one).toContain('SUMMARY:A\\, B\\; C');
    expect(one).toContain('ligne 1\\nligne 2');
  });

  it('un événement sur plusieurs jours se termine le dernier jour', () => {
    const forum = EVENTS.find((e) => e.id === 'e1')!;
    expect(ics).toContain(`DTSTART:${forum.date.replace(/-/g, '')}T090000`);
    expect(ics).toMatch(/DTEND:20261128T180000/);
  });
});
