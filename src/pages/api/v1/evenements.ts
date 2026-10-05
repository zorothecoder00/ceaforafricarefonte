/* API publique v1 — événements (CDC §13.2). GET ?pays=TG&a_venir=1&lang=fr|en */
import type { APIRoute } from 'astro';
import { allEvents } from '../../../lib/catalog';
import { country } from '../../../data/site';
import { ok, error, limited, preflight, paginate } from '../../../lib/public-api';

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  const lim = limited(request); if (lim) return lim;
  const pays = url.searchParams.get('pays')?.toUpperCase();
  if (pays && !/^[A-Z]{2}$/.test(pays)) return error(400, 'parametre_invalide', 'pays : code ISO 3166-1 alpha-2 (ex. TG).');
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'fr';
  const upcoming = url.searchParams.get('a_venir') === '1';
  const today = new Date().toISOString().slice(0, 10);
  const list = (await allEvents({ lang }))
    .filter((e) => (!pays || e.c === pays) && (!upcoming || e.date >= today))
    .map((e) => ({
      id: e.id, titre: e.t, date: e.date, heure: e.extra?.time ?? null, ville: e.city, pays: e.c, pays_nom: country(e.c), format: e.fmt, description: e.d,
      lieu: e.extra?.venue ? { nom: e.extra.venue.name, adresse: e.extra.venue.address, latitude: e.extra.venue.lat, longitude: e.extra.venue.lon } : null,
      billets: e.tk.map((t) => ({ categorie: t.n, prix_xof: t.p })), url: new URL(`${lang === 'en' ? '/en' : ''}/evenements/${e.id}`, url.origin).href,
    }));
  const p = paginate(list, url);
  return ok(p.items, p.meta);
};
export const OPTIONS: APIRoute = preflight;
