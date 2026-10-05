/* API publique v1 — offres d'emploi et de stage publiées (CDC §13.2). GET ?pays=SN&type=Stage&teletravail=1 */
import type { APIRoute } from 'astro';
import { listJobs } from '../../../lib/jobs';
import { country } from '../../../data/site';
import { ok, error, limited, preflight, paginate } from '../../../lib/public-api';

export const prerender = false;
const TYPES = ['CDI', 'CDD', 'Stage', 'Alternance', 'Freelance', 'Mission'];

export const GET: APIRoute = async ({ url, request }) => {
  const lim = limited(request); if (lim) return lim;
  const pays = url.searchParams.get('pays')?.toUpperCase();
  const type = url.searchParams.get('type');
  if (pays && !/^[A-Z]{2}$/.test(pays)) return error(400, 'parametre_invalide', 'pays : code ISO 3166-1 alpha-2 (ex. SN).');
  if (type && !TYPES.includes(type)) return error(400, 'parametre_invalide', `type : ${TYPES.join(', ')}.`);
  const remote = url.searchParams.get('teletravail') === '1';
  const list = (await listJobs({ types: type ? [type] : undefined }))
    .filter((j) => (!pays || j.c === pays) && (!remote || j.remote))
    .map((j) => ({ id: j.id, titre: j.t, entreprise: j.co, pays: j.c, pays_nom: country(j.c), type: j.type, teletravail: j.remote, diaspora: j.diaspora, remuneration: j.sal, competences: j.skills, debut: j.start, duree_mois: j.dur, url: new URL('/opportunites', url.origin).href }));
  const p = paginate(list, url);
  return ok(p.items, p.meta, 120);
};
export const OPTIONS: APIRoute = preflight;
