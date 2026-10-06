/* Recherche par le sens (CDC §10 « recherche sémantique par IA ») : le modèle lit la question et le catalogue des pages du site
   (base de connaissances de CEA Copilot + articles publiés du CMS) et renvoie les pages qui y répondent, classées.
   Sans IA disponible (clé absente, erreur, refus), repli sur la recherche par mots de la base de connaissances. */
import { askModel } from './ai';
import { knowledgeBase, retrieve, type KbDoc } from './kb';
import { publicArticles } from './cms';
import { lp } from '../i18n/ui';

export type SemanticHit = { t: string; d: string; h: string; ty: string };
export type SemanticResult = { mode: 'ia' | 'mots'; reformulation?: string; results: SemanticHit[] };

const SCHEMA = {
  type: 'object',
  properties: {
    reformulation: { type: 'string', description: 'La question reformulée en une phrase courte, dans la langue de l’utilisateur.' },
    ids: { type: 'array', items: { type: 'string' }, description: 'Identifiants des fiches qui répondent à la question, de la plus utile à la moins utile (8 au plus). Liste vide si aucune ne convient.' },
  },
  required: ['reformulation', 'ids'],
  additionalProperties: false,
};

const cache = new Map<string, { at: number; r: SemanticResult }>();

async function catalogue(): Promise<KbDoc[]> {
  const extra = (await publicArticles().catch(() => [])).map((a) => ({ id: `article:${a.id}`, kind: `Article — ${a.cat}`, title: a.t, url: `/ressources/article/${a.id}`, text: a.x ?? '' }));
  const ids = new Set(extra.map((d) => d.id));
  return [...extra, ...knowledgeBase().filter((d) => !ids.has(d.id))];
}

const hit = (d: KbDoc, lang: 'fr' | 'en'): SemanticHit => ({ t: d.title, d: d.text.replace(/\s+/g, ' ').slice(0, 140), h: lp(lang, d.url), ty: d.kind.split(' — ')[0] });

export async function semanticSearch(question: string, lang: 'fr' | 'en'): Promise<SemanticResult> {
  const q = question.trim().slice(0, 300);
  const key = `${lang}:${q.toLowerCase()}`;
  const c = cache.get(key);
  if (c && Date.now() - c.at < 10 * 60_000) return c.r;

  const docs = await catalogue();
  // Catalogue stable (mis en cache côté API) dans le prompt système ; la question seule dans le message
  const system = `Tu es le moteur de recherche du site CEA FOR AFRICA (entrepreneuriat africain) et de son portail financier CEA Kapital Invest.
On te donne une question posée par un visiteur et le catalogue des fiches du site, une par ligne : identifiant | type | titre | début du contenu.
Choisis les fiches qui aident vraiment à répondre à la question (sens, synonymes, intention), même sans mot en commun, classées de la plus utile à la moins utile, 8 au plus. N'invente aucun identifiant. Si rien ne convient, renvoie une liste vide.

CATALOGUE
${docs.map((d) => `${d.id} | ${d.kind} | ${d.title} | ${d.text.replace(/\s+/g, ' ').slice(0, 110)}`).join('\n')}`;
  const msg = await askModel({
    feature: 'recherche', system, effort: 'low', maxTokens: 2000, timeoutMs: 20_000, schema: SCHEMA,
    messages: [{ role: 'user', content: `Langue de l'utilisateur : ${lang === 'en' ? 'anglais' : 'français'}.\nQuestion : ${q}` }],
  });
  let r: SemanticResult | null = null;
  const text = msg?.content.find((b) => b.type === 'text');
  if (text && text.type === 'text') {
    try {
      const out = JSON.parse(text.text) as { reformulation: string; ids: string[] };
      const byId = new Map(docs.map((d) => [d.id, d]));
      const results = [...new Set(out.ids)].map((id) => byId.get(id)).filter((d): d is KbDoc => !!d).slice(0, 8).map((d) => hit(d, lang));
      r = { mode: 'ia', reformulation: out.reformulation, results };
    } catch { r = null; }
  }
  // Repli : recherche par mots dans le contenu des fiches (et pas seulement les titres)
  r ??= { mode: 'mots', results: retrieve(q, 8, docs.filter((d) => d.id.startsWith('article:'))).map((d) => hit(d, lang)) };
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), r });
  return r;
}
