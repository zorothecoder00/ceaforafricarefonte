/* CEA OS — CEA Copilot interne. POST JSON :
   { messages: [{ role: 'user'|'assistant', content }] } → conversation sur les données autorisées de l'utilisateur ;
   { task: 'semaine' | 'impact' | 'bailleur' | 'voix', id? } → rédaction guidée construite à partir des données réelles.
   → { ok, reply, ai } ; sans IA : réponse locale (conversation) ou message d'indisponibilité (rédaction). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail } from '../../../../lib/session';
import { rateLimit } from '../../../../lib/guard';
import { askModel, replyText } from '../../../../lib/ai';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, scopeState } from '../../../../lib/os/core';
import { SYS, contextText, localAnswer, taskPrompt } from '../../../../lib/os/copilot';

export const prerender = false;

const Body = z.union([
  z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) })).min(1).max(12) }),
  z.object({ task: z.enum(['semaine', 'impact', 'bailleur', 'voix']), id: z.string().max(64).optional() }),
]);

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const c = await osApi(locals.user);
  if (c instanceof Response) return c;
  const limited = rateLimit(request, `os-copilot:${locals.user!.id}`, 30, 600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Message invalide.');
  const b = p.data;
  const sc = scopeState(c, cookies);
  const people = await allStaff();
  const data = await contextText(c, sc, people);

  if ('task' in b) {
    const prompt = await taskPrompt(b.task, b.id, c, sc);
    if (typeof prompt !== 'string') return fail(prompt.error, 403);
    const res = await askModel({ feature: b.task === 'voix' ? 'synthese' : 'redaction', userId: locals.user!.id, system: SYS, messages: [{ role: 'user', content: `Données :\n${data}\n\nDemande : ${prompt}` }], maxTokens: 2500, timeoutMs: 60_000 });
    const text = res ? replyText(res) : '';
    return text ? json({ ok: true, reply: text, ai: true }) : fail('Copilot est indisponible pour le moment. Réessayez plus tard.', 503);
  }

  const msgs = b.messages;
  if (msgs.at(-1)!.role !== 'user') return fail('Message invalide.');
  const conv = msgs.slice(-6).map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Copilot'} : ${m.content}`).join('\n');
  const res = await askModel({ feature: 'copilot', userId: locals.user!.id, system: SYS, messages: [{ role: 'user', content: `Données :\n${data}\n\nConversation :\n${conv}\n\nRéponds au dernier message.` }], maxTokens: 1500, timeoutMs: 30_000 });
  const text = res ? replyText(res) : '';
  if (text) return json({ ok: true, reply: text, ai: true });
  return json({ ok: true, reply: await localAnswer(msgs.at(-1)!.content, c, sc, people), ai: false });
};
