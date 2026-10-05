/* Orientation en 5 questions (CDC §11) : recommande un parcours (programme, cours, mentor, financement).
   Les recommandations sont toujours choisies dans le catalogue réel du site. Un premier choix est fait par règles
   (disponible sans IA) ; CEA Copilot peut ensuite le personnaliser et en expliquer les raisons. */
import { COURSES, PATHS, PROGS, MENTORS, country } from '../data/site';

type Opt = { v: string; fr: string; en: string };
export const QUESTIONS: { k: 'stade' | 'besoin' | 'secteur' | 'fonds' | 'cible'; fr: string; en: string; opts: Opt[] }[] = [
  { k: 'stade', fr: 'Où en êtes-vous ?', en: 'Where are you at?', opts: [
    { v: 'apprendre', fr: "Je n'ai pas encore de projet, je veux apprendre", en: "No project yet, I want to learn" },
    { v: 'idee', fr: "J'ai une idée", en: 'I have an idea' },
    { v: 'lance', fr: "Mon entreprise a moins de 2 ans", en: 'My business is under 2 years old' },
    { v: 'croissance', fr: 'Mon entreprise est en croissance', en: 'My business is growing' },
  ] },
  { k: 'besoin', fr: 'De quoi avez-vous le plus besoin ?', en: 'What do you need most?', opts: [
    { v: 'former', fr: 'Me former', en: 'Training' },
    { v: 'structurer', fr: 'Valider et structurer mon modèle', en: 'Validate and structure my model' },
    { v: 'clients', fr: 'Trouver des clients et vendre', en: 'Find customers and sell' },
    { v: 'financer', fr: 'Financer mon activité', en: 'Fund my business' },
    { v: 'reseau', fr: 'Un mentor et un réseau', en: 'A mentor and a network' },
  ] },
  { k: 'secteur', fr: 'Votre secteur ?', en: 'Your sector?', opts: [
    { v: 'agri', fr: 'Agriculture et agro-industrie', en: 'Agriculture and agribusiness' },
    { v: 'numerique', fr: 'Numérique et fintech', en: 'Digital and fintech' },
    { v: 'commerce', fr: 'Commerce et services', en: 'Trade and services' },
    { v: 'industrie', fr: 'Industrie, énergie, BTP', en: 'Industry, energy, construction' },
    { v: 'autre', fr: 'Autre', en: 'Other' },
  ] },
  { k: 'fonds', fr: 'Quel financement recherchez-vous ?', en: 'How much funding are you looking for?', opts: [
    { v: 'aucun', fr: "Aucun pour l'instant", en: 'None for now' },
    { v: 'petit', fr: 'Moins de 10 millions FCFA', en: 'Under 10 million FCFA' },
    { v: 'moyen', fr: 'De 10 à 100 millions FCFA', en: '10 to 100 million FCFA' },
    { v: 'grand', fr: 'Plus de 100 millions FCFA', en: 'Over 100 million FCFA' },
  ] },
  { k: 'cible', fr: 'Un programme dédié vous concerne-t-il ?', en: 'Does a dedicated programme apply to you?', opts: [
    { v: 'non', fr: 'Non', en: 'No' },
    { v: 'femme', fr: 'Je suis une femme dirigeante', en: 'I am a woman business leader' },
    { v: 'diaspora', fr: 'Je vis dans la diaspora', en: 'I live in the diaspora' },
    { v: 'sahel', fr: "J'opère au Mali, au Burkina Faso ou au Sénégal", en: 'I operate in Mali, Burkina Faso or Senegal' },
  ] },
];

export type Answers = Record<(typeof QUESTIONS)[number]['k'], string>;
export type Kind = 'programme' | 'cours' | 'mentor' | 'financement';
export type Item = { id: string; kind: Kind; title: string; url: string; desc: string; tags: string[] };

const PROG_TAGS: Record<string, string[]> = {
  'Pré-incubation': ['idee', 'structurer', 'apprendre'],
  'Incubation': ['idee', 'lance', 'clients', 'structurer'],
  'Accélérateur — Cohorte 4': ['croissance', 'lance', 'financer', 'moyen', 'grand', 'clients'],
  'Investor Ready': ['croissance', 'financer', 'moyen', 'grand'],
  'Femmes entrepreneures': ['femme'],
  'Diaspora Connect': ['diaspora'],
  'Agritech Sahel': ['sahel', 'agri'],
};
const COURSE_TAGS: Record<string, string[]> = {
  'Création': ['apprendre', 'idee', 'structurer', 'former'],
  'Finance': ['financer', 'structurer', 'lance', 'croissance', 'petit', 'moyen'],
  'Levée de fonds': ['financer', 'croissance', 'moyen', 'grand'],
  'Marketing': ['clients', 'lance', 'commerce', 'numerique'],
  'Export': ['croissance', 'clients', 'commerce', 'agri', 'industrie'],
  'Gestion': ['lance', 'croissance', 'structurer'],
};

/** Catalogue des recommandations possibles (identifiants stables). */
export function catalog(): Item[] {
  return [
    ...(PROGS as unknown as [string, string, string, boolean, string][]).map(([t, dur, d, open, date], i): Item => ({
      id: `prog-${i}`, kind: 'programme', title: t, url: t.startsWith('Accélérateur') ? '/programmes/candidature' : t === 'Investor Ready' ? '/kapital/investor-ready' : '/programmes',
      desc: `${d} (${dur}). ${open ? `Candidatures ouvertes jusqu'au ${date}.` : `Prochaine session : ${date}.`}`, tags: PROG_TAGS[t] ?? [],
    })),
    ...COURSES.filter((c) => c.th !== 'Actionnariat').map((c): Item => ({ id: `cours-${c.id}`, kind: 'cours', title: c.t, url: `/academie/${c.id}`, desc: `Cours ${c.lv.toLowerCase()}, ${c.dur}${c.price ? '' : ', gratuit'} — thème ${c.th}.`, tags: [...(COURSE_TAGS[c.th] ?? []), 'former', ...(c.price ? [] : ['gratuit'])] })),
    ...PATHS.map((p): Item => ({ id: `parcours-${p.id}`, kind: 'cours', title: p.t, url: '/academie', desc: p.d, tags: p.id === 'pa2' ? ['financer', 'croissance', 'moyen', 'grand', 'former'] : p.id === 'pa1' ? ['apprendre', 'idee', 'lance', 'structurer', 'former'] : [] })),
    ...MENTORS.map((m, i): Item => ({ id: `mentor-${i}`, kind: 'mentor', title: m.n, url: '/communaute/mentorat', desc: `Mentor (${country(m.c)}) : ${m.x}. Langues : ${m.lang}.`, tags: ['reseau', ...(/lev|financ/i.test(m.x) ? ['financer', 'moyen', 'grand'] : []), ...(/pitch|commun/i.test(m.x) ? ['clients', 'financer'] : []), ...(/croissance|saas/i.test(m.x) ? ['croissance', 'numerique'] : []), ...(/bourse|gouvernance/i.test(m.x) ? ['grand', 'croissance'] : [])] })),
    { id: 'fin-diagnostic', kind: 'financement', title: 'Diagnostic « Suis-je prêt ? »', url: '/kapital/diagnostic', desc: 'Diagnostic gratuit de maturité en 8 questions, score sur 100.', tags: ['financer', 'moyen', 'grand', 'croissance', 'lance'] },
    { id: 'fin-soumettre', kind: 'financement', title: 'Soumettre mon dossier à CEA Kapital Invest', url: '/kapital/soumettre', desc: 'Dépôt du dossier de levée, revu par les analystes, suivi en temps réel.', tags: ['grand', 'croissance'] },
    { id: 'fin-ressources', kind: 'financement', title: 'Guides et modèles de levée', url: '/kapital/ressources', desc: 'Pitch, valorisation, data room : guides et modèles téléchargeables.', tags: ['financer', 'petit', 'moyen'] },
    { id: 'fin-studio', kind: 'financement', title: 'Project Studio', url: '/projets/nouveau', desc: 'Structurer son projet (fiche, canvas, modèle financier) et le présenter à des partenaires.', tags: ['idee', 'lance', 'structurer', 'petit', 'financer'] },
  ];
}

const KIND_LABEL: Record<Kind, [string, string]> = { programme: ['Programme', 'Programme'], cours: ['Formation', 'Training'], mentor: ['Mentor', 'Mentor'], financement: ['Financement', 'Funding'] };
export const kindLabel = (k: Kind, en: boolean) => KIND_LABEL[k][en ? 1 : 0];

export type Rec = { id: string; kind: Kind; title: string; url: string; desc: string; why: string };

/** Premier choix par règles : le meilleur élément de chaque type selon les réponses. */
export function ruleRecs(a: Answers, en = false): Rec[] {
  const wanted = Object.values(a);
  const label = (v: string) => { const t = QUESTIONS.flatMap((q) => q.opts).find((o) => o.v === v)?.[en ? 'en' : 'fr'] ?? v; return t[0].toLowerCase() + t.slice(1); };
  const kinds: Kind[] = a.besoin === 'financer' || a.fonds === 'grand' ? ['financement', 'programme', 'cours', 'mentor'] : a.besoin === 'reseau' ? ['mentor', 'programme', 'cours', 'financement'] : ['programme', 'cours', 'mentor', 'financement'];
  if (a.fonds === 'aucun' && a.besoin !== 'financer') kinds.pop();
  const items = catalog();
  const recs: Rec[] = kinds.flatMap((k) => {
    const best = items.filter((i) => i.kind === k)
      .map((i) => ({ i, hits: i.tags.filter((t) => wanted.includes(t)) }))
      .sort((x, y) => y.hits.length - x.hits.length || Number(y.i.tags.includes('gratuit')) - Number(x.i.tags.includes('gratuit')))[0];
    if (!best || !best.hits.length) return [];
    const why = (en ? 'Matches your answers: ' : 'Correspond à vos réponses : ') + best.hits.map(label).join(', ') + '.';
    return [{ id: best.i.id, kind: k, title: best.i.title, url: best.i.url, desc: best.i.desc, why }];
  });
  // Programme dédié (femmes, diaspora, Sahel) : proposé en plus quand il correspond à la situation déclarée
  const ded = a.cible !== 'non' ? items.find((i) => i.kind === 'programme' && i.tags.includes(a.cible)) : undefined;
  if (ded && !recs.some((r) => r.id === ded.id)) {
    const at = recs.findIndex((r) => r.kind === 'programme');
    recs.splice(at < 0 ? recs.length : at + 1, 0, { id: ded.id, kind: 'programme', title: ded.title, url: ded.url, desc: ded.desc, why: (en ? 'Dedicated programme: ' : 'Programme dédié : ') + label(a.cible) + '.' });
  }
  return recs;
}

/** Réponses valides uniquement (une option connue par question). */
export function validAnswers(x: unknown): Answers | null {
  if (!x || typeof x !== 'object') return null;
  const out: Partial<Answers> = {};
  for (const q of QUESTIONS) {
    const v = (x as Record<string, unknown>)[q.k];
    if (typeof v !== 'string' || !q.opts.some((o) => o.v === v)) return null;
    out[q.k] = v;
  }
  return out as Answers;
}
