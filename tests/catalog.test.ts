/* Catalogue des événements et cours (CDC §12, CMS) : la reprise d'un contenu du code produit une fiche publiable, et les fiches invalides sont refusées. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { EventData, CourseData, staticEventData, staticCourseData, emptyData } = await import('../src/lib/catalog');
const { EVENTS, COURSES } = await import('../src/data/site');

describe('reprise des contenus du code', () => {
  it.each(EVENTS.map((e) => e.id))('l’événement %s repris est une fiche publiable', (id) => {
    const r = EventData.safeParse(staticEventData(id)!.data);
    expect(r.success ? '' : r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')).toBe('');
  });
  it.each(COURSES.map((c) => c.id))('le cours %s repris est une fiche publiable', (id) => {
    const r = CourseData.safeParse(staticCourseData(id)!.data);
    expect(r.success ? '' : r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')).toBe('');
  });
  it('conserve leçons et quiz du cours', () => {
    const c = COURSES[0];
    const d = staticCourseData(c.id)!.data;
    expect(d.lessons.map((l) => l.title)).toEqual(c.ls.slice(0, -1));
    expect(d.quiz.length).toBeGreaterThan(0);
  });
});

describe('validation des fiches', () => {
  it('un nouveau contenu part d’une fiche à compléter : seul le formateur manque pour un cours', () => {
    expect(EventData.safeParse(emptyData.event()).success).toBe(true);
    const r = CourseData.safeParse(emptyData.course());
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toEqual(['by']);
  });
  it('refuse un événement sans billet ou à une date invalide', () => {
    expect(EventData.safeParse({ ...emptyData.event(), tickets: [] }).success).toBe(false);
    expect(EventData.safeParse({ ...emptyData.event(), date: '26/11/2026' }).success).toBe(false);
  });
  it('refuse un quiz dont la bonne réponse n’existe pas', () => {
    expect(CourseData.safeParse({ ...emptyData.course(), quiz: [{ q: 'Q', o: ['A', 'B'], a: 2 }] }).success).toBe(false);
  });
});
