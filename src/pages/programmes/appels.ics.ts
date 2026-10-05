/* Calendrier des appels à candidatures (CDC §7.6) : abonnement global ou fichier d'un seul programme (?programme=<index>). */
import type { APIRoute } from 'astro';
import { PROGS } from '../../data/site';
import { calendar } from '../../lib/ics';
import { publicCalls, applyPath } from '../../lib/calls';

export const prerender = false;

const progEvents = () => PROGS.map(([n, dur, , open, date], i) => ({
  id: `appel-${i}`,
  t: `${open ? 'Clôture' : 'Ouverture'} des candidatures : ${n}`,
  d: `Programme ${n} (${dur}).`,
  date: String(date),
  city: 'En ligne',
  path: open ? '/programmes/candidature' : '/programmes',
}));

export const GET: APIRoute = async ({ site, url }) => {
  // Appels créés dans le back-office (CDC §12) : date de clôture, ou d'ouverture s'ils sont à venir
  const db = (await publicCalls()).filter((c) => (c.state === 'ouvert' ? c.closesAt : c.opensAt)).map((c) => ({
    id: `appel-${c.slug}`, t: `${c.state === 'ouvert' ? 'Clôture' : 'Ouverture'} des candidatures : ${c.title}`, d: `Programme ${c.programme}.`,
    date: (c.state === 'ouvert' ? c.closesAt! : c.opensAt!).toISOString().slice(0, 10), city: 'En ligne', path: applyPath(c.slug),
  }));
  const all = [...progEvents(), ...db];
  const one = url.searchParams.get('programme');
  const list = one !== null ? all.filter((e) => e.id === `appel-${one}`) : all; // index d'un programme historique ou identifiant d'un appel
  if (!list.length) return new Response('Programme introuvable.', { status: 404 });
  return new Response(calendar(list, site?.origin, 'Appels à candidatures CEA FOR AFRICA'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `${one !== null ? 'attachment' : 'inline'}; filename="appels-cea${one !== null ? '-' + one : ''}.ics"` },
  });
};
