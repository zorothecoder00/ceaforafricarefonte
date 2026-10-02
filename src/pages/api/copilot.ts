/* CEA Copilot (CDC §9.4) : assistant conversationnel limité au périmètre de CEA, sans conseil en investissement personnalisé.
   POST { messages: [{ role: 'user'|'assistant', content }], lang } → { ok, reply } ou { ok:false, fallback:true } sans clé d'API. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { env } from '../../lib/env';
import { json, fail } from '../../lib/session';
import { rateLimit } from '../../lib/guard';
import { COURSES, EVENTS, PROGS } from '../../data/site';

export const prerender = false;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) })).min(1).max(12),
  lang: z.enum(['fr', 'en']).default('fr'),
});

const SYSTEM = (lang: string) => `Tu es CEA Copilot, l'assistant du site de CEA for Africa (Club des Entrepreneurs Africains), plateforme panafricaine d'accompagnement des entrepreneurs.
Réponds en ${lang === 'en' ? 'anglais' : 'français'}, en 2 à 5 phrases simples, et oriente vers la bonne page du site en donnant son chemin (ex. /kapital/diagnostic).
Périmètre : adhésion (/adherer), Académie (/academie), programmes (/programmes), Project Studio (/projets), événements (/evenements), communauté et mentorat (/communaute), emplois (/opportunites), Voix des entrepreneurs (/voix), CEA Kapital Invest (/kapital), contact (/contact).
Règles impératives :
- Tu ne donnes jamais de conseil en investissement personnalisé, ni de recommandation d'achat ou de vente d'un titre ; rappelle que tout investissement comporte un risque de perte en capital.
- Tu n'inventes ni chiffres, ni dates, ni noms : si tu ne sais pas, propose /contact.
- Tu ne demandes jamais de mot de passe, de code de vérification ni de données bancaires.
- Hors périmètre de CEA, décline poliment.
Repères à jour : cours ${COURSES.slice(0, 6).map((c) => `« ${c.t} » (/academie/${c.id})`).join(', ')} ; événements ${EVENTS.slice(0, 4).map((e) => `« ${e.t} » le ${e.date} (/evenements/${e.id})`).join(', ')} ; programmes ${PROGS.map((p) => `« ${p[0]} » (${p[1]})`).join(', ')}.`;

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, `copilot:${locals.user?.id ?? ''}`, 20, 600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Message invalide.');
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return json({ ok: false, fallback: true });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('COPILOT_MODEL') || 'claude-sonnet-5-5', max_tokens: 500, system: SYSTEM(p.data.lang), messages: p.data.messages }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!res?.ok) return json({ ok: false, fallback: true });
  const d = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
  const reply = d?.content?.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  return reply ? json({ ok: true, reply }) : json({ ok: false, fallback: true });
};
