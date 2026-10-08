/* Questions-réponses de la data room (CDC §8.9).
   POST  { dossierId, question }       → un investisseur sous accord de confidentialité pose une question à l'entreprise
   PATCH { id, answer, shared }        → l'entreprise (ou l'équipe Kapital) répond ; « shared » rend la réponse visible de tous
                                         les investisseurs sous accord, sans le nom de l'auteur de la question */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { dossier, dataRoomQuestion } from '../../../db/schema/kapital';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';
import { accessLevel } from '../../../lib/kapital';
import { notify } from '../../../lib/notify';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'dataroom-question', 10, 3600);
  if (limited) return limited;
  const p = z.object({ dossierId: z.uuid(), question: z.string().trim().min(10).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Écrivez votre question (10 caractères au moins).');
  if ((await accessLevel(u.id, p.data.dossierId)) !== 'dataroom') return fail('Les questions sont réservées aux investisseurs dont l’accès à la data room est ouvert.', 403);
  const [d] = await db.select({ owner: dossier.ownerId, analyst: dossier.analystId, ref: dossier.reference, company: dossier.companyName }).from(dossier).where(eq(dossier.id, p.data.dossierId));
  await db.insert(dataRoomQuestion).values({ dossierId: p.data.dossierId, investorId: u.id, question: p.data.question });
  await audit(u.id, 'kapital.dataroom.question', d.ref, {}, clientIp(request));
  await notify(d.owner, `Nouvelle question d'un investisseur sur la data room de ${d.company}.`, '/kapital/entreprise#questions', { email: true });
  if (d.analyst) await notify(d.analyst, `Question d'investisseur sur le dossier ${d.ref} (${d.company}).`, `/kapital/opportunites/${p.data.dossierId}#questions`);
  return json({ ok: true, message: 'Question envoyée à l’entreprise. Vous serez notifié de la réponse.' });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ id: z.uuid(), answer: z.string().trim().min(2).max(4000), shared: z.boolean().default(false) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Écrivez votre réponse.');
  const [q] = await db.select({ q: dataRoomQuestion, ref: dossier.reference, company: dossier.companyName }).from(dataRoomQuestion).innerJoin(dossier, eq(dossier.id, dataRoomQuestion.dossierId)).where(eq(dataRoomQuestion.id, p.data.id));
  if (!q) return fail('Question introuvable.', 404);
  const level = await accessLevel(u.id, q.q.dossierId);
  if (level !== 'proprietaire' && level !== 'equipe') return fail('Seule l’entreprise ou l’équipe Kapital peut répondre.', 403);
  await db.update(dataRoomQuestion).set({ answer: p.data.answer, shared: p.data.shared, answeredBy: u.id, answeredAt: new Date() }).where(eq(dataRoomQuestion.id, q.q.id));
  await audit(u.id, 'kapital.dataroom.reponse', q.ref, { partagee: p.data.shared }, clientIp(request));
  await notify(q.q.investorId, `${q.company} a répondu à votre question sur sa data room.`, `/kapital/opportunites/${q.q.dossierId}#questions`, { email: true });
  return json({ ok: true, message: p.data.shared ? 'Réponse publiée pour tous les investisseurs sous accord.' : 'Réponse envoyée à l’investisseur.' });
};
