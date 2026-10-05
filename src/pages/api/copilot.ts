/* CEA Copilot (CDC §11) : assistant conversationnel adossé à la base de connaissances validée de CEA, avec sources citées.
   Les fiches les plus proches de la question sont jointes au message ; le modèle cite les passages utilisés.
   POST { messages: [{ role: 'user'|'assistant', content }], lang }
     → { ok, reply, sources: [{ n, title, url, kind }], ai: true } ou { ok:false, fallback:true } (IA indisponible : réponses locales). */
import type { APIRoute } from 'astro';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { json, fail } from '../../lib/session';
import { rateLimit } from '../../lib/guard';
import { askModel } from '../../lib/ai';
import { retrieve, type KbDoc } from '../../lib/kb';

export const prerender = false;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) })).min(1).max(12),
  lang: z.enum(['fr', 'en']).default('fr'),
});

const SYSTEM = `Tu es CEA Copilot, l'assistant de CEA FOR AFRICA (Club des Entrepreneurs Africains), plateforme panafricaine qui accompagne les entrepreneurs : formation, programmes, événements, communauté, emplois et CEA Kapital Invest.

Réponds dans la langue de la dernière question de l'utilisateur (français, anglais ou autre), en 2 à 6 phrases simples, sans titres ni listes longues.

Sources : les documents joints proviennent de la base de connaissances validée de CEA. Pour tout fait sur CEA (programmes, dates, prix, cours, procédures, pages), appuie-toi uniquement sur ces documents et cite-les. Si les documents ne contiennent pas la réponse, dis-le simplement et propose la page /contact ou /aide plutôt que de deviner. Pour une question générale d'entrepreneuriat ou de finance, tu peux répondre avec tes connaissances générales en précisant qu'il s'agit d'une information générale.

Oriente vers la bonne page en donnant son chemin tel qu'il figure dans les documents (ex. /kapital/diagnostic).

Règles impératives :
- Jamais de conseil en investissement personnalisé ni de recommandation d'acheter ou de vendre ; rappelle que tout investissement comporte un risque de perte en capital.
- Les décisions d'admission, de sélection, d'investissement ou de publication sont prises par l'équipe CEA, pas par toi.
- Ne demande jamais de mot de passe, de code de vérification ni de données bancaires.
- Hors du périmètre de CEA, de l'entrepreneuriat et de la finance, décline poliment.`;

/** Message utilisateur enrichi des fiches de la base de connaissances (citations activées). */
function withDocs(question: string, docs: KbDoc[]): Anthropic.Beta.BetaMessageParam {
  return {
    role: 'user',
    content: [
      ...docs.map((d): Anthropic.Beta.BetaContentBlockParam => ({
        type: 'document',
        source: { type: 'text', media_type: 'text/plain', data: `${d.text}\nPage : ${d.url}` },
        title: d.title,
        context: d.kind,
        citations: { enabled: true },
      })),
      { type: 'text', text: question },
    ],
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, `copilot:${locals.user?.id ?? ''}`, 20, 600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Message invalide.');
  const msgs = p.data.messages;
  if (msgs[0].role !== 'user' || msgs.at(-1)!.role !== 'user') return fail('Message invalide.');

  // Recherche sur la dernière question, complétée par la précédente pour les relances courtes (« et le prix ? »)
  const userTurns = msgs.filter((m) => m.role === 'user').map((m) => m.content);
  const last = userTurns.at(-1)!;
  let docs = retrieve(last);
  if (docs.length < 3 && userTurns.length > 1) docs = [...new Map([...docs, ...retrieve(userTurns.at(-2)!)].map((d) => [d.id, d])).values()].slice(0, 6);

  const res = await askModel({
    feature: 'copilot',
    userId: locals.user?.id,
    system: SYSTEM,
    messages: [...msgs.slice(0, -1).map((m) => ({ role: m.role, content: m.content })), withDocs(last, docs)],
    maxTokens: 1500,
    timeoutMs: 30_000,
  });
  if (!res) return json({ ok: false, fallback: true });

  // Texte avec renvois numérotés [1], [2]… vers les fiches citées
  const sources: { n: number; title: string; url: string; kind: string }[] = [];
  const num = (i: number) => {
    const d = docs[i];
    if (!d) return null;
    let s = sources.find((x) => x.url === d.url && x.title === d.title);
    if (!s) sources.push((s = { n: sources.length + 1, title: d.title, url: d.url, kind: d.kind }));
    return s.n;
  };
  let reply = '';
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    reply += b.text;
    const refs = [...new Set((b.citations ?? []).map((c) => ('document_index' in c ? num(c.document_index) : null)).filter((n): n is number => n !== null))];
    if (refs.length) reply += refs.map((n) => `[${n}]`).join('');
  }
  reply = reply.trim();
  return reply ? json({ ok: true, reply, sources, ai: true }) : json({ ok: false, fallback: true });
};
