/* Rédaction assistée et synthèses (CDC §11) : propose un brouillon pour un champ de formulaire ; l'utilisateur garde la main
   (il relit, puis remplace, complète ou ignore). Réservée aux membres connectés.
   POST { kind, field, label, current, fields: { nom: valeur… }, lang } → { ok, draft } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail, requireUser } from '../../lib/session';
import { rateLimit } from '../../lib/guard';
import { aiEnabled, askModel, replyText } from '../../lib/ai';

export const prerender = false;

const KINDS = {
  projet: "une rubrique de la fiche projet normalisée d'un entrepreneur (Project Studio de CEA)",
  pitch: "le pitch oral d'une minute (environ 150 mots) d'un projet, à partir de sa fiche projet : accroche, problème, solution, marché, traction, demande",
  offre: "la description d'une offre d'emploi, de stage ou de mission publiée par un employeur : contexte de l'entreprise, missions, profil recherché, conditions",
  candidature: "une réponse du dossier de candidature d'un entrepreneur à un programme d'accompagnement de CEA",
  // Synthèses : mise en forme de notes prises pendant une séance ou une réunion
  'compte-rendu': "le compte rendu structuré d'une séance de mentorat, à partir des notes brutes du mentor : objectifs, points abordés, conseils, prochaines étapes avec responsable",
  'proces-verbal': "le procès-verbal d'une séance du comité d'investissement de CEA Kapital Invest, à partir des notes brutes : participants, dossier examiné, points discutés, décision et conditions, réserves ; la décision doit rester exactement celle notée",
} as const;
const SYNTHESES = new Set(['compte-rendu', 'proces-verbal']);

const Body = z.object({
  kind: z.enum(Object.keys(KINDS) as [keyof typeof KINDS, ...(keyof typeof KINDS)[]]),
  field: z.string().max(60),
  label: z.string().trim().max(200),
  current: z.string().max(6000).default(''),
  fields: z.record(z.string().max(60), z.string().max(6000)).default({}),
  lang: z.enum(['fr', 'en']).default('fr'),
});

const SYSTEM = `Tu es l'assistant de rédaction de CEA Copilot, sur la plateforme CEA FOR AFRICA (accompagnement des entrepreneurs africains).
Tu proposes un brouillon que la personne relira et modifiera : elle garde la main sur le texte final.
Règles :
- N'invente aucun fait, chiffre, nom, client ou résultat. Quand une information manque, écris un repère entre crochets, par exemple [chiffre d'affaires 2025 à compléter].
- Appuie-toi d'abord sur le texte déjà saisi et sur les autres champs du formulaire ; améliore la clarté et la structure sans changer le sens.
- Style clair, concret, sans jargon ni superlatifs ; phrases courtes ; pas de titre ni de mise en forme Markdown.
- Pour une offre d'emploi : aucun critère d'âge, de religion, d'origine, de sexe ou de situation familiale.
- Réponds uniquement par le texte proposé, dans la langue du formulaire.`;

export const POST: APIRoute = async ({ request, locals }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, `redaction:${u.id}`, 20, 3600);
  if (limited) return limited;
  if (!aiEnabled()) return fail("L'aide à la rédaction n'est pas disponible pour le moment.", 503);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const { kind, label, current, fields, lang } = p.data;
  const context = Object.entries(fields).filter(([k, v]) => k !== p.data.field && v.trim()).map(([k, v]) => `${k} : ${v.trim()}`).join('\n');
  const res = await askModel({
    feature: SYNTHESES.has(kind) ? 'synthese' : 'redaction',
    userId: u.id,
    system: SYSTEM,
    messages: [{ role: 'user', content: `À rédiger : ${KINDS[kind]}.\nChamp : « ${label} »\nLangue du formulaire : ${lang === 'en' ? 'anglais' : 'français'}\n\nAutres champs du formulaire :\n${context || '(aucun)'}\n\nTexte déjà saisi dans ce champ :\n${current.trim() || '(vide)'}` }],
    maxTokens: 3000,
    effort: 'medium',
  });
  const draft = res ? replyText(res) : '';
  return draft ? json({ ok: true, draft }) : fail("Impossible de proposer un texte pour l'instant. Réessayez dans un moment.", 502);
};
