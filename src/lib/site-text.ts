/* Textes et images modifiables du site (éditeur visuel du back-office).
   Chaque page publique rendue par le serveur passe par applySiteText (middleware) : les nœuds de texte et quelques
   attributs (lien, image, texte alternatif, infobulle, champ de saisie, date de compte à rebours) dont une version modifiée
   existe sont remplacés. La clé d'un élément dérive de son type et de son texte d'origine : un même texte présent plusieurs
   fois sur une page est modifié partout sur cette page ; la portée « * » le modifie sur tout le site.
   En mode édition, chaque texte est entouré d'une balise <cea-t> et chaque attribut modifiable est signalé (data-cea-a). */
import { createHash } from 'node:crypto';
import { db } from './db';
import { siteText } from '../db/schema/app';
import { needs2fa, scope } from './rbac';
import type { CurrentUser } from './session';

export const SITE = '*';
export type TextKind = 'text' | (typeof ATTRS)[number];
/** Attributs modifiables, par balise (« * » = toutes les balises). */
const ATTR_BY_TAG: Record<string, string[]> = {
  img: ['src', 'alt'], a: ['href'], input: ['placeholder'], textarea: ['placeholder'], '*': ['title', 'data-countdown'],
};
export const ATTRS = ['src', 'alt', 'href', 'placeholder', 'title', 'data-countdown'] as const;
export const KIND_LABEL: Record<string, string> = {
  text: 'Texte', src: 'Image', alt: 'Texte alternatif', href: 'Lien', placeholder: 'Champ de saisie', title: 'Infobulle', 'data-countdown': 'Compte à rebours',
};

/** Espaces ASCII réduits (les espaces insécables des nombres sont conservés). */
export const norm = (s: string) => s.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '');
export const keyOf = (kind: string, original: string) => createHash('sha1').update(kind + '\0' + norm(original)).digest('base64url').slice(0, 14);
/** Chemin de page normalisé (portée) : sans barre finale, préfixe /en conservé. */
export function pageScope(pathname: string): string {
  let p = pathname;
  try { p = decodeURI(pathname); } catch { /* adresse mal encodée : gardée telle quelle */ }
  return p.replace(/\/+$/, '') || '/';
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');

/** Valeur acceptable pour un attribut (pas de lien javascript:, image servie par le site ou en https). */
export function safeAttr(kind: string, v: string): boolean {
  if (kind === 'href') return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(v.trim());
  if (kind === 'src') return /^(\/|https:\/\/)/i.test(v.trim());
  if (kind === 'data-countdown') return !Number.isNaN(Date.parse(v));
  return true;
}

/** Droit de modifier les textes du site : contenus (M) sur tout le site, double authentification active si requise. */
export const canEditSite = (u: CurrentUser | null | undefined): u is CurrentUser =>
  !!u && scope(u.roles, 'contenus', 'M') === 'all' && (!needs2fa(u.roles) || !!u.twoFactorEnabled);

/* ===== Lecture des modifications (cache 30 s par instance, vidé à chaque enregistrement) ===== */
export type Overrides = Map<string, Map<string, string>>; // portée → clé → valeur
let cache: { at: number; v: Overrides } | null = null;
export async function loadOverrides(): Promise<Overrides> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const rows = await db.select({ scope: siteText.scope, key: siteText.key, value: siteText.value }).from(siteText).catch(() => null);
  const v: Overrides = new Map();
  for (const r of rows ?? []) {
    if (!v.has(r.scope)) v.set(r.scope, new Map());
    v.get(r.scope)!.set(r.key, r.value);
  }
  cache = { at: Date.now(), v };
  return v;
}
export const clearOverrides = () => { cache = null; };

/* ===== Transformation du HTML ===== */
export type ApplyOptions = {
  page?: Map<string, string>;
  site?: Map<string, string>;
  /** Back-office et espace membre : les modifications « tout le site » ne s'appliquent qu'hors du contenu principal (en-tête, pied de page). */
  siteOutsideMainOnly?: boolean;
  edit?: boolean;
};
export type ApplyResult = { html: string; originals: Record<string, string> };

const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript']);
const SKIP = new Set(['svg', 'select', 'template', 'head']);
const HAS_WORD = /[\p{L}\p{N}]/u;
const ATTR_RE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Lit la fin d'une balise ouvrante ou fermante en respectant les guillemets. */
function tagEnd(html: string, i: number): number {
  let q = '';
  for (let j = i + 1; j < html.length; j++) {
    const c = html[j];
    if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') return j;
  }
  return html.length - 1;
}

export function applySiteText(html: string, o: ApplyOptions): ApplyResult {
  const out: string[] = [];
  const originals: Record<string, string> = {};
  let i = 0, inBody = false, inMain = false, lastOpen = -1; // lastOpen : indice dans out de la dernière balise ouvrante
  const lookup = (key: string): [string | undefined, string] => {
    const p = o.page?.get(key);
    if (p !== undefined) return [p, 'p'];
    const s = o.site && !(o.siteOutsideMainOnly && inMain) ? o.site.get(key) : undefined;
    return s !== undefined ? [s, 's'] : [undefined, ''];
  };

  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4); const end = e < 0 ? html.length : e + 3;
      out.push(html.slice(i, end)); i = end; continue;
    }
    if (html[i] === '<' && /[a-zA-Z\/!]/.test(html[i + 1] ?? '')) {
      const end = tagEnd(html, i);
      let tag = html.slice(i, end + 1);
      const close = tag[1] === '/';
      const name = (/^<\/?([a-zA-Z][\w:-]*)/.exec(tag)?.[1] ?? '').toLowerCase();
      i = end + 1;
      if (close) {
        if (name === 'main') inMain = false;
        out.push(tag); lastOpen = -1; continue;
      }
      if (name === 'body') inBody = true;
      if (name === 'main') inMain = true;
      if (inBody && name && tag[1] !== '!') tag = rewriteAttrs(tag, name, o, lookup, originals);
      out.push(tag);
      lastOpen = out.length - 1;
      // Contenu brut (script, style…) ou zone sans texte modifiable (svg, select, head) : recopié tel quel
      if ((RAW.has(name) || SKIP.has(name)) && !tag.endsWith('/>')) {
        const re = new RegExp(`</${name}\\s*>`, 'ig'); re.lastIndex = i;
        const m = re.exec(html); const stop = m ? m.index : html.length;
        if (SKIP.has(name) && inBody) out.push(rewriteInner(html.slice(i, stop), o, lookup, originals)); else out.push(html.slice(i, stop));
        i = stop; lastOpen = -1;
      }
      continue;
    }
    // Nœud de texte
    let next = html.indexOf('<', i + 1); if (next < 0) next = html.length;
    const raw = html.slice(i, next); i = next;
    if (!inBody || !HAS_WORD.test(raw)) { out.push(raw); if (raw.trim()) lastOpen = -1; continue; }
    const lead = /^[ \t\n\r\f]*/.exec(raw)![0], trail = /[ \t\n\r\f]*$/.exec(raw)![0];
    const text = norm(decode(raw));
    const key = keyOf('text', text);
    const [val, s] = lookup(key);
    let body = raw.slice(lead.length, raw.length - trail.length);
    if (val !== undefined) {
      body = escText(val);
      originals[key] = text;
      if (lastOpen >= 0 && !o.edit) out[lastOpen] = syncCounter(out[lastOpen], val);
    }
    out.push(lead + (o.edit ? `<cea-t data-k="${key}"${s ? ` data-s="${s}"` : ''}>${body}</cea-t>` : body) + trail);
    lastOpen = -1;
  }
  return { html: out.join(''), originals };
}

/** Dans une zone sans texte modifiable, seuls les attributs des balises img et a sont traités (logo, liens en icône). */
function rewriteInner(chunk: string, o: ApplyOptions, lookup: (k: string) => [string | undefined, string], originals: Record<string, string>) {
  return chunk.replace(/<(img|a)\b[^>]*>/gi, (t, n: string) => rewriteAttrs(t, n.toLowerCase(), o, lookup, originals));
}

function rewriteAttrs(tag: string, name: string, o: ApplyOptions, lookup: (k: string) => [string | undefined, string], originals: Record<string, string>): string {
  if (o.edit) tag = tag.replace(/\sdata-count=("[^"]*"|'[^']*'|[^\s>]+)/, ''); // pas d'animation des compteurs en mode édition
  const allowed = [...(ATTR_BY_TAG[name] ?? []), ...ATTR_BY_TAG['*']];
  const head = /^<[a-zA-Z][\w:-]*/.exec(tag)![0];
  const tail = tag.endsWith('/>') ? '/>' : '>';
  const inner = tag.slice(head.length, tag.length - tail.length);
  const marks: string[] = [];
  let changed = false;
  ATTR_RE.lastIndex = 0;
  const rebuilt = inner.replace(ATTR_RE, (m, attr: string, dq?: string, sq?: string, uq?: string) => {
    const a = attr.toLowerCase();
    if (!allowed.includes(a)) return m;
    const v = dq ?? sq ?? uq;
    if (v === undefined) return m;
    const orig = decode(v);
    if (!norm(orig) || (a === 'href' && (orig === '#' || /^javascript:/i.test(orig)))) return m;
    const key = keyOf(a, orig);
    const [val, s] = lookup(key);
    if (o.edit) marks.push(`${a}:${key}:${s}`);
    if (val === undefined) return m;
    originals[key] = norm(orig);
    changed = true;
    return `${attr}="${escAttr(val)}"`;
  });
  if (!changed && !marks.length) return tag;
  return head + rebuilt + (marks.length ? ` data-cea-a="${marks.join(' ')}"` : '') + tail;
}

/** Compteur animé (data-count) : suit le nouveau nombre, ou devient statique si le texte n'est plus un entier. */
function syncCounter(tag: string, val: string): string {
  if (!/\sdata-count=/.test(tag)) return tag;
  const m = /^([\d   ]*\d)(\D*)$/.exec(val.trim());
  const strip = tag.replace(/\sdata-(count|suffix)=("[^"]*"|'[^']*'|[^\s>]+)/g, '');
  if (!m) return strip;
  const n = m[1].replace(/\D/g, '');
  return strip.replace(/\s*\/?>$/, (end) => ` data-count="${n}"${m[2] ? ` data-suffix="${escAttr(m[2])}"` : ''}${end}`);
}
