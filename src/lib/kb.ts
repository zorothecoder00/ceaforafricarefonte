/* Base de connaissances validée de CEA (CDC §11, génération augmentée par la recherche).
   Seuls les contenus publiés sur le site y figurent : aide, programmes, cours, parcours, événements, articles, glossaire, pages.
   Chaque fiche porte un lien vers sa page : CEA Copilot cite ces fiches comme sources. */
import { HELP, HELP_CATS } from '../data/aide';
import { COURSES, PATHS, EVENTS, ARTICLES, GLOSS, JOBS, OPPS, allMenuLinks, country, money } from '../data/site';
import { staticProgrammes } from './catalogue';
import { score } from './fuzzy';

export type KbDoc = { id: string; kind: string; title: string; url: string; text: string };

let cache: KbDoc[] | undefined;

export function knowledgeBase(): KbDoc[] {
  if (cache) return cache;
  const docs: KbDoc[] = [
    ...HELP.map((h) => ({ id: `aide:${h.slug}`, kind: `Aide — ${HELP_CATS[h.cat] ?? h.cat}`, title: h.q, url: `/aide/${h.slug}`, text: h.a.join('\n') + (h.links?.length ? `\nPages utiles : ${h.links.map(([u, l]) => `${l} (${u})`).join(', ')}` : '') })),
    ...staticProgrammes().map((p, i) => ({ id: `prog:${i}`, kind: 'Programme', title: p.title, url: p.href, text: `Programme « ${p.title} » : ${p.description}. Durée : ${p.duration}. ${p.state === 'ouvert' ? `Candidatures ouvertes jusqu'au ${p.closesAt!.toISOString().slice(0, 10)}` : p.state === 'clos' ? 'Candidatures closes' : `Prochaine session : ${p.opensAt!.toISOString().slice(0, 10)}`}.` })),
    ...COURSES.map((c) => ({ id: `cours:${c.id}`, kind: 'Cours de l\'Académie', title: c.t, url: `/academie/${c.id}`, text: `Cours « ${c.t} » (thème ${c.th}, niveau ${c.lv}, durée ${c.dur}, ${money(c.price)}), par ${c.by}. Leçons : ${c.ls.join(' ; ')}.` })),
    ...PATHS.map((p) => ({ id: `parcours:${p.id}`, kind: 'Parcours de l\'Académie', title: p.t, url: '/academie', text: `${p.t} : ${p.d} Cours inclus : ${p.c.map((id) => COURSES.find((c) => c.id === id)?.t ?? id).join(', ')}.` })),
    ...EVENTS.map((e) => ({ id: `evt:${e.id}`, kind: 'Événement', title: e.t, url: `/evenements/${e.id}`, text: `${e.t} — ${e.date}, ${e.city} (${country(e.c)}), format ${e.fmt}. ${e.d} Billets : ${e.tk.map((t) => `${t.n} ${money(t.p)}`).join(', ')}.` })),
    ...ARTICLES.map((a) => ({ id: `article:${a.id}`, kind: `Article — ${a.cat}`, title: a.t, url: `/ressources/article/${a.id}`, text: `${a.t} (${a.d}, ${a.c}) : ${a.x}` })),
    ...(GLOSS as unknown as [string, string][]).map(([t, d]) => ({ id: `glossaire:${t}`, kind: 'Glossaire', title: t, url: '/ressources/glossaire', text: `${t} : ${d}` })),
    ...JOBS.map((j) => ({ id: `emploi:${j.id}`, kind: 'Offre d\'emploi', title: j.t, url: '/opportunites', text: `${j.t} chez ${j.co} (${country(j.c)}), ${j.type}${j.remote ? ', télétravail possible' : ''}. Rémunération : ${j.sal}. Compétences : ${j.skills.join(', ')}.` })),
    // Opportunités Kapital : faits publics seulement, jamais de recommandation (rappel ajouté au texte)
    ...OPPS.map((o) => ({ id: `kapital:${o.id}`, kind: 'Opportunité CEA Kapital Invest', title: o.n, url: `/kapital/opportunites/${o.id}`, text: `${o.n} : secteur ${o.s}, ${country(o.c)}, stade ${o.st}, statut « ${o.ver} ». Besoin : ${money(o.need)} en ${o.inst}. Ceci est une information, pas une recommandation d'investissement ; tout investissement comporte un risque de perte en capital.` })),
    ...allMenuLinks().filter((l) => l.desc).map((l) => ({ id: `page:${l.href}`, kind: l.kapital ? 'Page CEA Kapital Invest' : 'Page du site', title: l.title, url: l.href, text: `${l.title} : ${l.desc}` })),
  ];
  cache = docs;
  return docs;
}

/** Fiches les plus pertinentes pour une question (recherche tolérante aux fautes, titre prioritaire).
    extra : fiches supplémentaires (articles publiés du CMS), qui remplacent les fiches de même identifiant. */
export function retrieve(query: string, limit = 6, extra: KbDoc[] = []): KbDoc[] {
  // Les mots courts et les mots-outils ne départagent rien : on les retire, et une fiche peut ne contenir qu'une partie des mots
  const words = query.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()));
  if (!words.length) return [];
  const ids = new Set(extra.map((d) => d.id));
  return [...extra, ...knowledgeBase().filter((d) => !ids.has(d.id))]
    .map((d) => ({ d, s: words.reduce((n, w) => n + score(w, d.title, d.kind + ' ' + d.text), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.d);
}

const STOP = new Set(['comment', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'pour', 'avec', 'dans', 'sont', 'est-ce', 'faire', 'peux', 'puis', 'vous', 'nous', 'votre', 'notre', 'cette', 'mais', 'what', 'which', 'with', 'from', 'that', 'this', 'have', 'there', 'about', 'your', 'where', 'when', 'does']);
