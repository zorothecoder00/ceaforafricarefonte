/* Calendrier des appels à candidatures (CDC §7.6) : abonnement global ou fichier d'un seul programme (?programme=<index>). */
import type { APIRoute } from 'astro';
import { PROGS } from '../../data/site';
import { calendar } from '../../lib/ics';

export const prerender = false;

const progEvents = () => PROGS.map(([n, dur, , open, date], i) => ({
  id: `appel-${i}`,
  t: `${open ? 'Clôture' : 'Ouverture'} des candidatures : ${n}`,
  d: `Programme ${n} (${dur}).`,
  date: String(date),
  city: 'En ligne',
  path: open ? '/programmes/candidature' : '/programmes',
}));

export const GET: APIRoute = ({ site, url }) => {
  const all = progEvents();
  const one = url.searchParams.get('programme');
  const list = one !== null ? all.filter((e) => e.id === `appel-${one}`) : all;
  if (!list.length) return new Response('Programme introuvable.', { status: 404 });
  return new Response(calendar(list, site?.origin, 'Appels à candidatures CEA FOR AFRICA'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `${one !== null ? 'attachment' : 'inline'}; filename="appels-cea${one !== null ? '-' + one : ''}.ics"` },
  });
};
