/* Tests de compétences de CEA Talents (CDC §7.4) : tirage des questions et mélange des réponses propres à chaque passage
   (recalculés au moment de corriger, jamais envoyés), durée limitée, nouvelle tentative 30 jours après un échec.
   Réussite → badge vérifiable (certificat « test:<id> ») et compétence ajoutée au profil. */
import { createHmac, randomInt } from 'node:crypto';
import { and, desc, eq, like } from 'drizzle-orm';
import { db } from './db';
import { skillTestAttempt, certificate, profile } from '../db/schema/app';
import { SKILL_TESTS, DRAW, PASS, RETRY_DAYS, findTest, type SkillTest } from '../data/skill-tests';
import { reference, audit } from './session';
import { notify } from './notify';

const GRACE_MS = 60_000; // délai de transmission toléré après la fin du temps imparti
const secret = () => process.env.BETTER_AUTH_SECRET || 'cea-tests';

/** Ordre d'affichage des réponses de la question `q` pour le passage `attemptId` : perm[i] = indice d'origine. */
export function optionOrder(attemptId: string, q: number, n: number) {
  const h = createHmac('sha256', secret()).update(`${attemptId}|${q}`).digest();
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = h[i % h.length] % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  return perm;
}

/** Tirage de `k` questions distinctes parmi `n`. */
export function draw(n: number, k: number) {
  const pool = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.min(k, n));
}

/** Correction pure : `answers[i]` = position choisie dans l'ordre affiché de la i-ème question. */
export function grade(test: SkillTest, attemptId: string, questions: number[], answers: number[]) {
  const score = questions.filter((qi, i) => {
    const q = test.questions[qi];
    const shown = answers[i];
    return shown != null && shown >= 0 && optionOrder(attemptId, qi, q.o.length)[shown] === q.a;
  }).length;
  return { score, total: questions.length, passed: score / questions.length >= PASS };
}

export const deadline = (a: { startedAt: Date }, t: SkillTest) => new Date(a.startedAt.getTime() + t.minutes * 60_000);

export type TestStatus = { test: SkillTest; badge: string | null; open: typeof skillTestAttempt.$inferSelect | null; retryOn: Date | null; last: typeof skillTestAttempt.$inferSelect | null };
export async function statusFor(userId: string): Promise<TestStatus[]> {
  const [attempts, badges] = await Promise.all([
    db.select().from(skillTestAttempt).where(eq(skillTestAttempt.userId, userId)).orderBy(desc(skillTestAttempt.startedAt)),
    db.select({ subject: certificate.subject, number: certificate.number }).from(certificate).where(and(eq(certificate.userId, userId), like(certificate.subject, 'test:%'))),
  ]);
  const now = Date.now();
  return SKILL_TESTS.map((test) => {
    const mine = attempts.filter((a) => a.testId === test.id);
    const open = mine.find((a) => !a.submittedAt && deadline(a, test).getTime() + GRACE_MS > now) ?? null;
    const last = mine.find((a) => a.submittedAt) ?? null;
    const retryOn = last && !last.passed ? new Date(last.submittedAt!.getTime() + RETRY_DAYS * 864e5) : null;
    return { test, badge: badges.find((b) => b.subject === `test:${test.id}`)?.number ?? null, open, last, retryOn: retryOn && retryOn.getTime() > now ? retryOn : null };
  });
}

export async function startTest(userId: string, testId: string) {
  const st = (await statusFor(userId)).find((s) => s.test.id === testId);
  if (!st) return { error: 'Test inconnu.' };
  if (st.badge) return { error: 'Vous avez déjà obtenu ce badge.' };
  if (st.open) return { attempt: st.open };
  if (st.retryOn) return { error: `Nouvelle tentative possible à partir du ${st.retryOn.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}.` };
  const [attempt] = await db.insert(skillTestAttempt).values({ userId, testId, questions: draw(st.test.questions.length, DRAW) }).returning();
  return { attempt };
}

/** Questions telles qu'affichées (sans les bonnes réponses). */
export function shownQuestions(test: SkillTest, a: { id: string; questions: number[] }) {
  return a.questions.map((qi) => { const q = test.questions[qi]; return { q: q.q, o: optionOrder(a.id, qi, q.o.length).map((i) => q.o[i]) }; });
}

export async function submitTest(userId: string, attemptId: string, answers: number[], now = new Date()) {
  const [a] = await db.select().from(skillTestAttempt).where(and(eq(skillTestAttempt.id, attemptId), eq(skillTestAttempt.userId, userId)));
  if (!a) return { error: 'Passage introuvable.' };
  if (a.submittedAt) return { error: 'Ce passage est déjà corrigé.' };
  const test = findTest(a.testId)!;
  const late = now.getTime() > deadline(a, test).getTime() + GRACE_MS;
  const r = late ? { score: 0, total: a.questions.length, passed: false } : grade(test, a.id, a.questions, answers);
  const [done] = await db.update(skillTestAttempt).set({ submittedAt: now, score: r.score, passed: r.passed })
    .where(and(eq(skillTestAttempt.id, a.id), eq(skillTestAttempt.userId, userId))).returning();
  if (!done) return { error: 'Passage introuvable.' };
  let badge: string | null = null;
  if (r.passed) {
    badge = reference('BADGE');
    await db.insert(certificate).values({ number: badge, userId, subject: `test:${test.id}`, title: `Badge de compétence — ${test.title}` });
    // La compétence vérifiée rejoint le profil Talents (visible des recruteurs)
    const [p] = await db.select({ skills: profile.skills }).from(profile).where(eq(profile.userId, userId));
    if (p && !p.skills.some((s) => s.toLowerCase() === test.skill.toLowerCase())) await db.update(profile).set({ skills: [...p.skills, test.skill] }).where(eq(profile.userId, userId));
    await audit(userId, 'talents.badge.delivrance', badge, { test: test.id, score: r.score });
    await notify(userId, `Badge obtenu : ${test.title} (${r.score}/${r.total}).`, `/verifier/certificat/${badge}`, { email: true });
  }
  return { ...r, late, badge };
}
