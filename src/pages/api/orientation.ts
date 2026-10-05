/* Orientation en 5 questions (CDC §11).
   POST { answers: { stade, besoin, secteur, fonds, cible }, note?, lang }
     → { ok, summary, recs: [{ id, kind, title, url, desc, why }], ai }
   Sans IA (ou si sa réponse est invalide), les recommandations par règles sont renvoyées avec ai:false. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail } from '../../lib/session';
import { rateLimit } from '../../lib/guard';
import { askModel, replyText } from '../../lib/ai';
import { QUESTIONS, catalog, ruleRecs, validAnswers, type Rec } from '../../lib/orientation';

export const prerender = false;

const Body = z.object({ answers: z.unknown(), note: z.string().trim().max(500).optional(), lang: z.enum(['fr', 'en']).default('fr') });

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Deux phrases qui résument la situation et la logique du parcours proposé.' },
    recs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, why: { type: 'string', description: 'Une phrase : pourquoi cet élément, au regard des réponses.' } },
        required: ['id', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'recs'],
  additionalProperties: false,
};
const Out = z.object({ summary: z.string().min(1).max(800), recs: z.array(z.object({ id: z.string(), why: z.string().min(1).max(400) })).min(1).max(6) });

const SYSTEM = `Tu es le module d'orientation de CEA Copilot, sur la plateforme CEA FOR AFRICA.
À partir des 5 réponses d'une personne, tu proposes un parcours de 3 à 5 étapes, ordonnées, choisies uniquement dans le catalogue fourni (par leur identifiant exact).
Varie les types quand c'est utile (programme, formation, mentor, financement) et commence par l'étape la plus utile maintenant.
Pour chaque étape, une phrase concrète qui relie l'élément aux réponses. Ne promets ni admission ni financement : ce sont des recommandations, l'équipe CEA décide.
Réponds en {LANG}.`;

export const POST: APIRoute = async ({ request, locals }) => {
  const limited = rateLimit(request, `orientation:${locals.user?.id ?? ''}`, 10, 600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const answers = validAnswers(p.data.answers);
  if (!answers) return fail('Répondez aux 5 questions.');
  const en = p.data.lang === 'en';
  const rules = ruleRecs(answers, en);
  const fallback = () => json({ ok: true, ai: false, summary: en ? 'Here is a first path based on your answers.' : 'Voici un premier parcours établi à partir de vos réponses.', recs: rules });

  const items = catalog();
  const answered = QUESTIONS.map((q) => `- ${q.fr} ${q.opts.find((o) => o.v === answers[q.k])!.fr}`).join('\n');
  const res = await askModel({
    feature: 'orientation',
    userId: locals.user?.id,
    system: SYSTEM.replace('{LANG}', en ? 'anglais' : 'français'),
    messages: [{ role: 'user', content: `Catalogue (identifiant | type | titre | description) :\n${items.map((i) => `${i.id} | ${i.kind} | ${i.title} | ${i.desc}`).join('\n')}\n\nRéponses :\n${answered}${p.data.note ? `\n\nPrécision de la personne : ${p.data.note}` : ''}\n\nPremier choix proposé par les règles (à améliorer si besoin) : ${rules.map((r) => r.id).join(', ')}` }],
    schema: SCHEMA,
    maxTokens: 3000,
    timeoutMs: 40_000,
  });
  if (!res) return fallback();
  const out = Out.safeParse((() => { try { return JSON.parse(replyText(res)); } catch { return null; } })());
  if (!out.success) return fallback();
  const recs: Rec[] = out.data.recs.flatMap((r) => {
    const i = items.find((x) => x.id === r.id);
    return i ? [{ id: i.id, kind: i.kind, title: i.title, url: i.url, desc: i.desc, why: r.why }] : [];
  });
  return recs.length >= 2 ? json({ ok: true, ai: true, summary: out.data.summary, recs: [...new Map(recs.map((r) => [r.id, r])).values()] }) : fallback();
};
