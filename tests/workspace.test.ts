/* Poste de travail CEA OS (noyau sans base) : score de priorité, plan du jour, conflits, charge, récurrences, périodes,
   progression, comparaison de versions, modèles. */
import { describe, expect, it } from 'vitest';
import { conflicts, dayPlan, fillTemplate, lineDiff, objectiveProgress, periodKey, priorityScore, recurrenceDue, weekLoad } from '../src/lib/os/workspace-core';

const D = (s: string) => new Date(s + 'Z');
const now = D('2026-10-14T09:00:00'); // mercredi

describe('score de priorité (ESP-01)', () => {
  it('retard > aujourd’hui > demain > semaine', () => {
    const s = (due: string) => priorityScore({ due: D(due) }, now);
    expect(s('2026-10-12T17:00:00')).toBeGreaterThan(s('2026-10-14T17:00:00'));
    expect(s('2026-10-14T17:00:00')).toBeGreaterThan(s('2026-10-15T17:00:00'));
    expect(s('2026-10-15T17:00:00')).toBeGreaterThan(s('2026-10-20T17:00:00'));
    expect(s('2026-11-30T17:00:00')).toBe(0);
  });
  it('la priorité déclarée compte, borné à 0–100', () => {
    expect(priorityScore({ due: D('2026-11-30T00:00:00'), priority: 'urgente' }, now)).toBe(30);
    expect(priorityScore({ due: D('2026-11-30T00:00:00'), priority: 'basse' }, now)).toBe(0);
    expect(priorityScore({ due: D('2026-09-01T00:00:00'), priority: 'urgente', status: 'En cours' }, now)).toBe(100);
  });
});

describe('plan du jour (ESP-03)', () => {
  const day = D('2026-10-14T00:00:00');
  it('les tâches remplissent les trous entre les rendez-vous, par score', () => {
    const p = dayPlan(day, [{ start: D('2026-10-14T09:00:00'), end: D('2026-10-14T11:00:00'), title: 'Comité', kind: 'reunion' }], [
      { id: 'a', title: 'Petite', estimate: 1, score: 10 }, { id: 'b', title: 'Urgente', estimate: 1, score: 90 },
    ]);
    const tasks = p.slots.filter((s) => s.ref);
    expect(tasks[0].ref).toBe('b');
    expect(tasks[0].start.toISOString()).toBe('2026-10-14T08:00:00.000Z');
    expect(tasks[1].start.toISOString()).toBe('2026-10-14T11:00:00.000Z'); // après le comité
    expect(p.later).toEqual([]);
  });
  it('une tâche trop longue est reportée', () => {
    const p = dayPlan(day, [], [{ id: 'x', title: 'Énorme', estimate: 12, score: 50 }]);
    expect(p.later.map((t) => t.id)).toEqual(['x']);
    expect(p.free).toBe(9);
  });
});

describe('agenda et charge', () => {
  it('conflits : chevauchements seulement (ESP-02)', () => {
    const a = { start: D('2026-10-14T09:00:00'), end: D('2026-10-14T10:00:00'), id: 'a' };
    const b = { start: D('2026-10-14T09:30:00'), end: D('2026-10-14T11:00:00'), id: 'b' };
    const c = { start: D('2026-10-14T11:00:00'), end: D('2026-10-14T12:00:00'), id: 'c' };
    expect(conflicts([c, b, a]).map(([x, y]) => x.id + y.id)).toEqual(['ab']);
  });
  it('charge : surcharge, congés déduits de la capacité (ESP-04)', () => {
    expect(weekLoad({ taskHours: 30, meetingHours: 10, blockHours: 5, leaveDays: 0, realHours: 0 }).level).toBe('surcharge');
    const l = weekLoad({ taskHours: 10, meetingHours: 2, blockHours: 0, leaveDays: 2, realHours: 8 });
    expect(l.capacity).toBe(24);
    expect(l.level).toBe('normale');
    expect(weekLoad({ taskHours: 1, meetingHours: 0, blockHours: 0, leaveDays: 0, realHours: 0 }).level).toBe('disponible');
  });
});

describe('missions et objectifs', () => {
  it('récurrences (AUT-04)', () => {
    expect(recurrenceDue('jour', now)).toBe(true);
    expect(recurrenceDue('jour', D('2026-10-17T09:00:00'))).toBe(false); // samedi
    expect(recurrenceDue('semaine:3', now)).toBe(true); // mercredi
    expect(recurrenceDue('semaine:1', now)).toBe(false);
    expect(recurrenceDue('mois:14', now)).toBe(true);
    expect(recurrenceDue(null, now)).toBe(false);
  });
  it('périodes', () => {
    expect(periodKey('semaine', now)).toBe('2026-S42');
    expect(periodKey('mois', now)).toBe('2026-10');
    expect(periodKey('trimestre', now)).toBe('2026-T4');
  });
  it('progression : tâches rattachées sinon valeur / cible (ESP-06)', () => {
    expect(objectiveProgress({ target: 10, current: 5 })).toBe(50);
    expect(objectiveProgress({ target: 10, current: 50 })).toBe(100);
    expect(objectiveProgress({ target: 10, current: 5 }, { done: 1, total: 4 })).toBe(25);
  });
});

describe('documents', () => {
  it('comparaison ligne à ligne (DOC-02)', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([{ op: '=', text: 'a' }, { op: '-', text: 'b' }, { op: '+', text: 'B' }, { op: '=', text: 'c' }, { op: '+', text: 'd' }]);
  });
  it('modèles : variables remplacées, inconnues laissées visibles (DOC-01)', () => {
    expect(fillTemplate('{{titre}} — {{ Auteur }} — {{inconnu}}', { titre: 'Note', auteur: 'Afi' })).toBe('Note — Afi — {{inconnu}}');
  });
});
