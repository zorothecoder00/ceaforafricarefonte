/* API publique v1 — programmes et appels à candidatures (CDC §13.2). GET ?statut=ouvert|a_venir|clos */
import type { APIRoute } from 'astro';
import { PROGS } from '../../../data/site';
import { publicCalls, applyPath } from '../../../lib/calls';
import { ok, error, limited, preflight, paginate } from '../../../lib/public-api';

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  const lim = limited(request); if (lim) return lim;
  const st = url.searchParams.get('statut');
  if (st && !['ouvert', 'a_venir', 'clos'].includes(st)) return error(400, 'parametre_invalide', 'statut : ouvert, a_venir ou clos.');
  const abs = (p: string) => new URL(p, url.origin).href;
  const calls = (await publicCalls()).map((c) => ({ id: c.slug, titre: c.title, programme: c.programme, statut: c.state, ouverture: c.opensAt?.toISOString() ?? null, cloture: c.closesAt?.toISOString() ?? null, description: c.description, url: abs(applyPath(c.slug)) }));
  const taken = new Set(calls.map((c) => c.titre));
  // Programmes du catalogue sans appel en base (dates indicatives)
  const catalogue = (PROGS as unknown as [string, string, string, boolean, string][]).filter(([n]) => !taken.has(n)).map(([n, duree, d, open, date]) => ({
    id: n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), titre: n, programme: n, statut: open ? 'ouvert' : 'a_venir',
    ouverture: open ? null : `${date}T00:00:00Z`, cloture: open ? `${date}T23:59:59Z` : null, description: `${d} (${duree}).`, url: abs('/programmes'),
  }));
  const list = [...calls, ...catalogue].filter((c) => !st || c.statut === st);
  const p = paginate(list, url);
  return ok(p.items, p.meta);
};
export const OPTIONS: APIRoute = preflight;
