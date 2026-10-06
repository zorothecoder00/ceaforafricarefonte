/* Calendrier des appels à candidatures (CDC §7.6) : abonnement global ou fichier d'un seul programme (?programme=<identifiant>).
   Même catalogue que les pages publiques : date de clôture d'un appel ouvert, ou d'ouverture d'un appel annoncé. */
import type { APIRoute } from 'astro';
import { calendar } from '../../lib/ics';
import { programmeCatalogue } from '../../lib/calls';

export const prerender = false;

export const GET: APIRoute = async ({ site, url }) => {
  const now = Date.now();
  const all = (await programmeCatalogue()).flatMap((p) => {
    const date = p.state === 'ouvert' ? p.closesAt : p.state === 'a_venir' && p.opensAt && p.opensAt.getTime() >= now ? p.opensAt : null;
    if (!date) return [];
    return [{
      id: `appel-${p.slug}`, t: `${p.state === 'ouvert' ? 'Clôture' : 'Ouverture'} des candidatures : ${p.title}`,
      d: `Programme ${p.programme}${p.duration ? ` (${p.duration})` : ''}.`, date: date.toISOString().slice(0, 10), city: 'En ligne', path: p.canApply || p.source === 'appel' ? p.href : '/programmes',
    }];
  });
  const one = url.searchParams.get('programme');
  const list = one !== null ? all.filter((e) => e.id === `appel-${one}`) : all;
  if (!list.length) return new Response('Programme introuvable.', { status: 404 });
  return new Response(calendar(list, site?.origin, 'Appels à candidatures CEA FOR AFRICA'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `${one !== null ? 'attachment' : 'inline'}; filename="appels-cea${one !== null ? '-' + one : ''}.ics"` },
  });
};
