/* API publique v1 — programmes et appels à candidatures (CDC §13.2). GET ?statut=ouvert|a_venir|clos
   Même catalogue que les pages publiques (appels du back-office et programmes du code sans appel). */
import type { APIRoute } from 'astro';
import { programmeCatalogue } from '../../../lib/calls';
import { ok, error, limited, preflight, paginate } from '../../../lib/public-api';

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  const lim = limited(request); if (lim) return lim;
  const st = url.searchParams.get('statut');
  if (st && !['ouvert', 'a_venir', 'clos'].includes(st)) return error(400, 'parametre_invalide', 'statut : ouvert, a_venir ou clos.');
  const abs = (p: string) => new URL(p, url.origin).href;
  const list = (await programmeCatalogue()).filter((p) => !st || p.state === st).map((p) => ({
    id: p.slug, titre: p.title, programme: p.programme, statut: p.state, ouverture: p.opensAt?.toISOString() ?? null, cloture: p.closesAt?.toISOString() ?? null,
    description: p.duration ? `${p.description} (${p.duration}).` : p.description, url: abs(p.canApply || p.source === 'appel' ? p.href : '/programmes'),
  }));
  const pg = paginate(list, url);
  return ok(pg.items, pg.meta);
};
export const OPTIONS: APIRoute = preflight;
