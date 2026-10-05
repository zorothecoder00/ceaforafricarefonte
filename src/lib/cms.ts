/* CMS éditorial (CDC §12) : blocs, rendu HTML sûr, circuit de validation, lecture des contenus publiés.
   Les articles écrits dans le code (src/data) restent affichés tant qu'aucun contenu du CMS ne porte le même identifiant :
   l'import d'un article dans le CMS le remplace sur le site, sans injection de données en production. */
import { z } from 'zod';
import { and, desc, eq, inArray, lte, or } from 'drizzle-orm';
import { db } from './db';
import { cmsContent, type cmsStatusEnum } from '../db/schema/app';
import { ARTICLES } from '../data/site';
import type { KbDoc } from './kb';

/* ----- Blocs ----- */
const txt = z.string().max(20000);
export const Block = z.discriminatedUnion('t', [
  z.object({ t: z.literal('p'), text: txt }),
  z.object({ t: z.literal('h'), text: z.string().max(300), level: z.union([z.literal(2), z.literal(3)]) }),
  z.object({ t: z.literal('list'), items: z.array(z.string().max(2000)).max(100), ordered: z.boolean() }),
  z.object({ t: z.literal('quote'), text: z.string().max(3000), cite: z.string().max(200) }),
  z.object({ t: z.literal('callout'), text: z.string().max(3000), tone: z.enum(['info', 'gold', 'ok']) }),
  z.object({ t: z.literal('image'), mediaId: z.uuid(), caption: z.string().max(300) }),
  z.object({ t: z.literal('video'), url: z.url().max(500) }),
]);
export type Block = z.infer<typeof Block>;
export const Blocks = z.array(Block).max(300);

export const BLOCK_LABELS: Record<Block['t'], string> = { p: 'Paragraphe', h: 'Intertitre', list: 'Liste', quote: 'Citation', callout: 'Encadré', image: 'Image', video: 'Vidéo' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Mise en forme en ligne : **gras**, *italique*, [lien](https://… ou /chemin). Tout le reste est échappé. */
export function inline(s: string) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith('/') ? '' : ' rel="noopener" target="_blank"'}>${t}</a>`);
}

/** Lien d'intégration pour YouTube et Vimeo ; null pour tout autre site (pas d'iframe arbitraire). */
export function videoEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return vm ? `https://player.vimeo.com/video/${vm[1]}` : null;
}

export const mediaUrl = (id: string) => `/media/${id}`;

/** Rendu HTML des blocs (pour la page publique et l'aperçu). */
export function renderBlocks(blocks: Block[], alts: Record<string, string> = {}) {
  return blocks.map((b) => {
    switch (b.t) {
      case 'p': return `<p>${inline(b.text).replace(/\n/g, '<br>')}</p>`;
      case 'h': return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
      case 'list': { const tag = b.ordered ? 'ol' : 'ul'; return `<${tag}>${b.items.filter((i) => i.trim()).map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>`; }
      case 'quote': return `<blockquote class="cms-quote"><p>${inline(b.text)}</p>${b.cite ? `<footer>— ${esc(b.cite)}</footer>` : ''}</blockquote>`;
      case 'callout': return `<div class="panel cms-callout tone-${b.tone}">${inline(b.text).replace(/\n/g, '<br>')}</div>`;
      case 'image': return `<figure class="cms-figure"><img src="${mediaUrl(b.mediaId)}" alt="${esc(alts[b.mediaId] ?? '')}" loading="lazy" />${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`;
      case 'video': { const src = videoEmbed(b.url); return src ? `<div class="cms-video"><iframe src="${src}" title="Vidéo" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>` : ''; }
    }
  }).join('\n');
}

export const wordCount = (blocks: Block[]) => blocks.reduce((n, b) => n + ('text' in b ? b.text.split(/\s+/).length : 'items' in b ? b.items.join(' ').split(/\s+/).length : 0), 0);
export const readingTime = (blocks: Block[]) => `${Math.max(1, Math.round(wordCount(blocks) / 200))} min`;

/* ----- Circuit de validation : rédaction → relecture → validation → publication (immédiate ou programmée) ----- */
export type CmsStatus = (typeof cmsStatusEnum.enumValues)[number];
export const STATUS_LABEL: Record<CmsStatus, string> = { brouillon: 'Brouillon', en_relecture: 'En relecture', valide: 'Validé', programme: 'Programmé', publie: 'Publié', archive: 'Archivé' };
export const STATUS_TONE: Record<CmsStatus, string> = { brouillon: '', en_relecture: 'info', valide: 'gold', programme: 'gold', publie: 'ok', archive: 'bad' };

/** Transitions permises : « edit » = droit de rédiger (C/M), « validate » = droit de valider et publier (V). */
export const TRANSITIONS: Record<CmsStatus, { to: CmsStatus; label: string; needs: 'edit' | 'validate' }[]> = {
  brouillon: [{ to: 'en_relecture', label: 'Envoyer en relecture', needs: 'edit' }],
  en_relecture: [{ to: 'valide', label: 'Valider', needs: 'validate' }, { to: 'brouillon', label: 'Renvoyer en rédaction', needs: 'validate' }],
  valide: [{ to: 'publie', label: 'Publier maintenant', needs: 'validate' }, { to: 'programme', label: 'Programmer la publication', needs: 'validate' }, { to: 'brouillon', label: 'Renvoyer en rédaction', needs: 'validate' }],
  programme: [{ to: 'publie', label: 'Publier maintenant', needs: 'validate' }, { to: 'valide', label: 'Annuler la programmation', needs: 'validate' }],
  publie: [{ to: 'archive', label: 'Dépublier (archiver)', needs: 'validate' }],
  archive: [{ to: 'brouillon', label: 'Reprendre en rédaction', needs: 'edit' }],
};

/** Un contenu est visible s'il est publié, ou programmé et arrivé à sa date. */
export const isLive = (c: { status: CmsStatus; publishAt: Date | null }, now = new Date()) => c.status === 'publie' || (c.status === 'programme' && !!c.publishAt && c.publishAt <= now);
const liveWhere = (now: Date) => or(eq(cmsContent.status, 'publie'), and(eq(cmsContent.status, 'programme'), lte(cmsContent.publishAt, now)));

/* ----- Lecture publique des articles ----- */
export type ArticleCardData = { id: string; t: string; cat: string; c: string; d: string; r: string; x: string; k?: boolean };

/** Articles visibles : ceux du CMS (dans la langue demandée, sinon en français) et ceux du code non remplacés. */
export async function publicArticles(lang: 'fr' | 'en' = 'fr'): Promise<ArticleCardData[]> {
  const rows = await db.select().from(cmsContent).where(and(eq(cmsContent.type, 'article'), inArray(cmsContent.lang, ['fr', lang]), liveWhere(new Date()))).orderBy(desc(cmsContent.publishedAt)).catch(() => []);
  // Une seule version par contenu : celle de la langue demandée si elle existe
  const byKey = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!byKey.has(r.key) || r.lang === lang) byKey.set(r.key, r);
  const cms = [...byKey.values()].map((r): ArticleCardData => ({
    id: r.slug, t: r.title, cat: r.category ?? 'Article', c: r.country ?? 'Panafricain',
    d: (r.publishAt && r.status === 'programme' ? r.publishAt : r.publishedAt ?? r.updatedAt).toISOString().slice(0, 10),
    r: readingTime(r.blocks as Block[]), x: r.excerpt, k: r.featured,
  }));
  const taken = new Set(cms.map((a) => a.id));
  return [...cms, ...ARTICLES.filter((a) => !taken.has(a.id))].sort((a, b) => b.d.localeCompare(a.d));
}

/** Article du CMS par identifiant d'URL (langue demandée d'abord, puis français). */
export async function cmsArticle(slug: string, lang: 'fr' | 'en' = 'fr') {
  const rows = await db.select().from(cmsContent).where(and(eq(cmsContent.type, 'article'), eq(cmsContent.slug, slug), inArray(cmsContent.lang, ['fr', lang]))).catch(() => []);
  const live = rows.filter((r) => isLive(r));
  return live.find((r) => r.lang === lang) ?? live.find((r) => r.lang === 'fr') ?? null;
}

/** Identifiant d'URL lisible à partir d'un titre. */
export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'article';

/** Conversion d'un article écrit dans le code en blocs, pour l'importer dans le CMS. */
export function staticArticleBlocks(a: (typeof ARTICLES)[number]): Block[] {
  return [{ t: 'p', text: a.x }];
}

/** Articles publiés du CMS sous forme de fiches pour la base de connaissances de CEA Copilot (mis en cache 5 minutes). */
let kbCache: { at: number; docs: KbDoc[] } | undefined;
export async function cmsKbDocs(): Promise<KbDoc[]> {
  if (kbCache && Date.now() - kbCache.at < 300_000) return kbCache.docs;
  const rows = await db.select().from(cmsContent).where(and(eq(cmsContent.type, 'article'), eq(cmsContent.lang, 'fr'), liveWhere(new Date()))).catch(() => []);
  const plain = (b: Block) => (b.t === 'list' ? b.items.join(' ; ') : 'text' in b ? b.text : '');
  const docs = rows.map((r): KbDoc => ({ id: `article:${r.slug}`, kind: `Article — ${r.category ?? 'Ressources'}`, title: r.title, url: `/ressources/article/${r.slug}`, text: [r.excerpt, ...(r.blocks as Block[]).map(plain)].join('\n').slice(0, 6000) }));
  kbCache = { at: Date.now(), docs };
  return docs;
}
