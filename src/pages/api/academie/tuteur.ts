/* Tuteur pédagogique (CDC §11) : explique, résume ou crée un quiz d'entraînement sur une leçon de l'Académie.
   S'appuie uniquement sur le contenu de la leçon. Le quiz d'entraînement ne compte pas pour le certificat (quiz final officiel).
   POST { course, lesson, action: 'expliquer'|'resumer'|'quiz'|'question', question?, lang }
     → { ok, text } ou { ok, quiz: [{ q, o: [...], a, why }] } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail, requireUser } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';
import { aiEnabled, askModel, replyText } from '../../../lib/ai';
import { COURSES } from '../../../data/site';
import { CONTENT } from '../../../data/course-content';

export const prerender = false;

const Body = z.object({
  course: z.string().max(10),
  lesson: z.number().int().min(0).max(50),
  action: z.enum(['expliquer', 'resumer', 'quiz', 'question']),
  question: z.string().trim().max(600).optional(),
  lang: z.enum(['fr', 'en']).default('fr'),
});

const SYSTEM = `Tu es le tuteur pédagogique de CEA Academy (CEA FOR AFRICA), pour des entrepreneurs africains qui apprennent souvent sur téléphone.
Tu t'appuies sur la leçon fournie. Tu peux donner un exemple concret tiré du contexte africain (marché local, Mobile Money, espace OHADA), sans inventer de chiffres officiels, de lois ni de taux : si un point dépend du pays, dis-le et invite à vérifier auprès de l'administration ou d'un professionnel.
Style : phrases courtes, vocabulaire simple, pas de titres ni de Markdown. Si la question sort du sujet du cours, réponds brièvement et ramène à la leçon.`;

const ACTIONS = {
  expliquer: 'Explique cette leçon simplement, en 6 à 10 phrases, avec un exemple concret.',
  resumer: 'Résume cette leçon en 4 à 6 points essentiels, un par ligne, chacun commençant par « – ».',
  quiz: "Crée un quiz d'entraînement de 3 questions à choix multiple (3 options chacune, une seule bonne) qui vérifient la compréhension de cette leçon, avec une courte explication de la bonne réponse.",
  question: "Réponds à la question de l'apprenant en 3 à 8 phrases.",
} as const;

const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, o: { type: 'array', items: { type: 'string' } }, a: { type: 'integer', description: 'Indice (à partir de 0) de la bonne option' }, why: { type: 'string' } },
        required: ['q', 'o', 'a', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};
const Quiz = z.object({ questions: z.array(z.object({ q: z.string().min(1), o: z.array(z.string().min(1)).min(2).max(5), a: z.number().int().min(0), why: z.string() })).min(1).max(5) });

export const POST: APIRoute = async ({ request, locals }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, `tuteur:${u.id}`, 30, 3600);
  if (limited) return limited;
  if (!aiEnabled()) return fail("Le tuteur n'est pas disponible pour le moment.", 503);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const { course, lesson, action, question, lang } = p.data;
  const c = COURSES.find((x) => x.id === course);
  const l = CONTENT[course]?.lessons[lesson];
  if (!c || !l) return fail('Leçon introuvable.', 404);
  if (action === 'question' && !question) return fail('Posez votre question.');

  const lessonText = `Cours : ${c.t} (niveau ${c.lv})\nLeçon ${lesson + 1} : ${c.ls[lesson]}\n\n${l.s}\n\nÀ retenir :\n${l.k.map((k) => `- ${k}`).join('\n')}`;
  const res = await askModel({
    feature: 'tuteur',
    userId: u.id,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${lessonText}\n\nConsigne : ${ACTIONS[action]}${question ? `\nQuestion de l'apprenant : ${question}` : ''}\nLangue de la réponse : ${lang === 'en' ? 'anglais' : 'français'}.` }],
    maxTokens: 3000,
    ...(action === 'quiz' ? { schema: QUIZ_SCHEMA } : {}),
  });
  if (!res) return fail('Le tuteur ne peut pas répondre pour le moment. Réessayez dans un moment.', 502);
  const text = replyText(res);
  if (action !== 'quiz') return text ? json({ ok: true, text }) : fail('Réponse vide, réessayez.', 502);
  const q = Quiz.safeParse((() => { try { return JSON.parse(text); } catch { return null; } })());
  if (!q.success) return fail('Quiz indisponible, réessayez.', 502);
  return json({ ok: true, quiz: q.data.questions.filter((x) => x.a < x.o.length) });
};
