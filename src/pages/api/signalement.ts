/* Signalement d'un contenu, d'une fraude ou d'une faille (CDC §6, §7.8, §14). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../lib/db';
import { report } from '../../db/schema/app';
import { json, fail, audit, clientIp, reference } from '../../lib/session';
import { rateLimit, isBot, readJson } from '../../lib/guard';

export const prerender = false;

const Body = z.object({
  category: z.string().trim().min(3).max(80),
  url: z.string().trim().max(500).optional().default(''),
  description: z.string().trim().min(10).max(5000),
  contact: z.string().trim().max(160).optional().default(''),
  anonymous: z.boolean().default(true),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, 'signalement', 8);
  if (limited) return limited;
  const raw = await readJson(request);
  if (isBot(raw)) return json({ ok: true });
  const p = Body.safeParse(raw);
  if (!p.success) return fail('Décrivez les faits en quelques phrases (10 caractères minimum).');
  const ref = reference('SIG');
  await db.insert(report).values({ category: p.data.category, url: p.data.url || null, description: p.data.description, contact: p.data.anonymous ? null : p.data.contact || null, anonymous: p.data.anonymous });
  await audit(p.data.anonymous ? null : locals.user?.id, 'signalement', ref, { category: p.data.category }, p.data.anonymous ? null : clientIp(request));
  return json({ ok: true, reference: ref, message: `Signalement ${ref} reçu. La modération vérifie sous 48 heures.` });
};
