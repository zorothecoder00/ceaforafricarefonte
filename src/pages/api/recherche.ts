/* Recherche universelle (CDC §10) : contenus publiés du CMS (articles, événements, cours, pages), ajoutés par le navigateur
   à l'index des pages statiques. GET ?lang=fr|en → { entries: [{ t, d, h, ty, c?, s?, dt? }] }. Mis en cache 5 minutes. */
import type { APIRoute } from 'astro';
import { and, inArray } from 'drizzle-orm';
import { db } from '../../lib/db';
import { cmsContent } from '../../db/schema/app';
import { allEvents, allCourses } from '../../lib/catalog';
import { isLive } from '../../lib/cms';
import { country } from '../../data/site';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const en = url.searchParams.get('lang') === 'en';
  const lang = en ? 'en' : 'fr';
  const pre = (h: string) => (en ? `/en${h}` : h);
  const rows = (await db.select().from(cmsContent).where(and(inArray(cmsContent.type, ['article', 'page']), inArray(cmsContent.lang, ['fr', lang]))).catch(() => []))
    .filter((r) => isLive(r));
  // Une entrée par contenu : version de la langue demandée si elle existe
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byKey.has(r.key) || r.lang === lang) byKey.set(r.key, r);
  const entries = [
    ...[...byKey.values()].map((r) => r.type === 'article'
      ? { t: r.title, d: r.excerpt, h: pre(`/ressources/article/${r.slug}`), ty: 'Article', ...(r.country && r.country !== 'Panafricain' ? { c: r.country } : {}), ...(r.category ? { s: r.category } : {}), dt: (r.publishedAt ?? r.updatedAt).toISOString().slice(0, 10) }
      : { t: r.title, d: r.excerpt, h: pre(`/${r.slug}`), ty: 'Page' }),
    ...(await allEvents({ lang })).filter((e) => e.fromCms).map((e) => ({ t: e.t, d: `${e.city} · ${e.date}`, h: pre(`/evenements/${e.id}`), ty: en ? 'Event' : 'Événement', c: country(e.c), dt: e.date })),
    ...(await allCourses({ lang })).filter((c) => c.fromCms).map((c) => ({ t: c.t, d: `${c.th} · ${c.by}`, h: pre(`/academie/${c.id}`), ty: en ? 'Course' : 'Cours', s: c.th })),
  ];
  return new Response(JSON.stringify({ entries }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
};
