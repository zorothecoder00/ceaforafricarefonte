/* Voix des entrepreneurs (CDC §7.7).
   POST { action:'proposition', title, body, theme?, country? } · { action:'soutien', proposalId } · { action:'groupe', group, join }
        { action:'barometre', activite, tresorerie, credit, emploi, administration } (une réponse par membre et par trimestre) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { proposal, proposalSupport, workingGroupMember, barometerResponse, profile } from '../../db/schema/app';
import { json, fail, requireUser, audit } from '../../lib/session';
import { rateLimit } from '../../lib/guard';
import { WGROUPS } from '../../data/site';

export const prerender = false;

const quarterOf = (d = new Date()) => `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
const score = z.coerce.number().int().min(1).max(5);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('proposition'), title: z.string().trim().min(8).max(160), body: z.string().trim().min(30).max(5000), theme: z.string().max(60).optional(), country: z.string().max(2).optional() }),
  z.object({ action: z.literal('soutien'), proposalId: z.uuid() }),
  z.object({ action: z.literal('groupe'), group: z.string().refine((g) => WGROUPS.includes(g)), join: z.boolean().default(true) }),
  z.object({ action: z.literal('barometre'), activite: score, tresorerie: score, credit: score, emploi: score, administration: score }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez les champs du formulaire.');
  const b = p.data;
  switch (b.action) {
    case 'proposition': {
      const limited = rateLimit(request, `prop:${u.id}`, 3, 86_400);
      if (limited) return limited;
      const [row] = await db.insert(proposal).values({ userId: u.id, title: b.title, body: b.body, theme: b.theme, country: b.country }).returning({ id: proposal.id });
      await db.insert(proposalSupport).values({ proposalId: row.id, userId: u.id });
      await audit(u.id, 'voix.proposition', row.id);
      return json({ ok: true, message: 'Proposition déposée. Elle sera examinée par la commission compétente ; suivez son statut ci-dessous.' });
    }
    case 'soutien': {
      const ins = await db.insert(proposalSupport).values({ proposalId: b.proposalId, userId: u.id }).onConflictDoNothing().returning();
      return json({ ok: true, message: ins.length ? 'Merci pour votre soutien.' : 'Vous soutenez déjà cette proposition.' });
    }
    case 'groupe':
      if (b.join) await db.insert(workingGroupMember).values({ group: b.group, userId: u.id }).onConflictDoNothing();
      else await db.delete(workingGroupMember).where(and(eq(workingGroupMember.group, b.group), eq(workingGroupMember.userId, u.id)));
      return json({ ok: true, message: b.join ? `Vous avez rejoint la commission ${b.group}. Invitation à la prochaine réunion par e-mail.` : `Vous avez quitté la commission ${b.group}.` });
    case 'barometre': {
      const [pr] = await db.select({ country: profile.country, sector: profile.sector }).from(profile).where(eq(profile.userId, u.id));
      const { action: _a, ...answers } = b;
      const ins = await db.insert(barometerResponse).values({ quarter: quarterOf(), userId: u.id, country: pr?.country, sector: pr?.sector, answers }).onConflictDoNothing().returning();
      return json({ ok: true, message: ins.length ? 'Merci : votre réponse est anonymisée et agrégée aux résultats.' : 'Vous avez déjà répondu ce trimestre.' });
    }
  }
};
