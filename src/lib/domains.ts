/* Domaines d'intervention : ceux du code (src/data/proto.ts, traduits en anglais dans src/i18n/content-en.ts) + ceux créés
   ou modifiés par l'équipe dans le back-office (table domain). Source unique pour l'accueil, le méga-menu, /domaines,
   l'inscription des entrepreneurs, la gouvernance et l'annuaire des membres. Cache de 30 secondes. */
import { asc } from 'drizzle-orm';
import { db } from './db';
import { domain } from '../db/schema/app';
import { DOMAINS } from '../data/site';
import { tr } from '../i18n/content-en';

export type Domain = { id: string; ic: string; n: string; dom: string; d: string; k: string; to: string; pub: string; met: string[]; liv: string[]; active: boolean; source: 'code' | 'modifie' | 'cree'; position: number };

let cache: { at: number; rows: (typeof domain.$inferSelect)[] } | null = null;
async function rows() {
  if (cache && Date.now() - cache.at < 30_000) return cache.rows;
  const r = await db.select().from(domain).orderBy(asc(domain.position)).catch(() => []);
  cache = { at: Date.now(), rows: r };
  return r;
}
export const clearDomainCache = () => { cache = null; };

/** Domaines visibles (ou tous avec { all: true }, pour le back-office), dans l'ordre d'affichage. */
export async function allDomains(o: { lang?: 'fr' | 'en'; all?: boolean } = {}): Promise<Domain[]> {
  const db_ = await rows();
  const byId = new Map(db_.map((r) => [r.id, r]));
  const coded = (o.lang === 'en' ? tr('en').domains : DOMAINS) as unknown as (typeof DOMAINS)[number][];
  const out: Domain[] = coded.map((d, i) => {
    const r = byId.get(d.id);
    return r ? fromRow(r, 'modifie') : { id: d.id, ic: d.ic, n: d.n, dom: d.dom, d: d.d, k: d.k, to: d.to, pub: d.pub, met: [...d.met], liv: [...d.liv], active: true, source: 'code' as const, position: (i + 1) * 10 };
  });
  for (const r of db_) if (!coded.some((d) => d.id === r.id)) out.push(fromRow(r, 'cree'));
  return out.filter((d) => o.all || d.active).sort((a, b) => a.position - b.position);
}

const fromRow = (r: typeof domain.$inferSelect, source: 'modifie' | 'cree'): Domain => ({
  id: r.id, ic: r.icon, n: r.name, dom: r.dom, d: r.summary, k: r.highlight, to: r.link || `/domaines/${r.id}`, pub: r.audience, met: r.method, liv: r.deliverables, active: r.active, source, position: r.position,
});

export const findDomain = async (id: string) => (await allDomains()).find((d) => d.id === id);
