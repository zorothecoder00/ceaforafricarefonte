/* Quiz « Actionnaire averti » (CDC §7.1) : correction côté serveur et délivrance d'un certificat vérifiable par QR code.
   POST { answers: number[] } — connexion requise (le certificat est nominatif). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { certificate } from '../../../db/schema/app';
import { json, fail, requireUser, reference, audit } from '../../../lib/session';
import { notify } from '../../../lib/notify';
import { rateLimit } from '../../../lib/guard';
import { verifyUrl } from '../../../lib/qr';
import { linkedinCertUrl } from '../../../lib/share';
import { QUIZ, QUIZ_PASS, QUIZ_SUBJECT, QUIZ_TITLE } from '../../../data/quiz-actionnaire';

export const prerender = false;

const Body = z.object({ answers: z.array(z.number().int().min(-1).max(10)).length(QUIZ.length) });

export const POST: APIRoute = async ({ locals, request, url }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'quiz-act:' + u.id, 20, 3600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Répondez à toutes les questions.');
  const score = QUIZ.filter((q, i) => p.data.answers[i] === q.ok).length;
  if (score < QUIZ_PASS) return json({ ok: true, passed: false, score, total: QUIZ.length, message: `${score}/${QUIZ.length}. Il faut ${QUIZ_PASS} bonnes réponses : relisez les fiches « Comprendre ».` });
  let [c] = await db.select().from(certificate).where(and(eq(certificate.userId, u.id), eq(certificate.subject, QUIZ_SUBJECT)));
  if (!c) {
    [c] = await db.insert(certificate).values({ number: reference('CERT'), userId: u.id, subject: QUIZ_SUBJECT, title: QUIZ_TITLE }).returning();
    await audit(u.id, 'certificat.delivrance', c.number, { quiz: QUIZ_SUBJECT, score });
    await notify(u.id, `Certificat obtenu : ${QUIZ_TITLE}`, `/verifier/certificat/${c.number}`, { email: true });
  }
  const verify = verifyUrl(url.origin, 'certificat', c.number);
  return json({
    ok: true, passed: true, score, total: QUIZ.length, number: c.number, issuedAt: c.issuedAt, verify,
    linkedin: linkedinCertUrl({ title: c.title, number: c.number, issuedAt: c.issuedAt, verifyUrl: verify }),
    message: `${score}/${QUIZ.length} : félicitations, votre certificat est délivré.`,
  });
};
