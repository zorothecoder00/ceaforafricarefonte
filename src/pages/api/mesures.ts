/* Réception des Core Web Vitals mesurés dans les navigateurs (CDC §13.1). Envoi par navigator.sendBeacon à la fermeture de la page.
   Anonyme : ni cookie, ni identifiant, ni adresse IP conservée. Les requêtes du query string et les identifiants dans le chemin sont
   ramenés à un modèle (/evenements/:id) pour ne rien stocker de personnel. POST { p, m: [[métrique, valeur]], mob, lite } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../lib/db';
import { webVital } from '../../db/schema/ops';
import { rateLimit } from '../../lib/guard';

export const prerender = false;
const Body = z.object({
  p: z.string().max(200),
  m: z.array(z.tuple([z.enum(['LCP', 'INP', 'CLS']), z.number().min(0).max(120000)])).min(1).max(3),
  mob: z.boolean(),
  lite: z.boolean().default(false),
});
// Segments variables remplacés : identifiants, nombres, UUID, jetons
const pattern = (p: string) => (p.split('?')[0].split('#')[0] || '/').split('/').map((s) => (/^[0-9a-f-]{16,}$|^\d+$|^[a-z]\d+$|^[A-Za-z0-9_-]{20,}$/i.test(s) ? ':id' : s)).join('/').slice(0, 120);

export const POST: APIRoute = async ({ request }) => {
  if (rateLimit(request, 'mesures', 30, 60)) return new Response(null, { status: 204 });
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return new Response(null, { status: 204 });
  const path = pattern(p.data.p);
  await db.insert(webVital).values(p.data.m.map(([metric, value]) => ({ path, metric, value, mobile: p.data.mob, lite: p.data.lite }))).catch(() => {});
  return new Response(null, { status: 204 });
};
