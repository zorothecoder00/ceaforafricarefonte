/* Concours mensuel de portefeuille virtuel (CDC §8.6), membres connectés.
   POST { action: 'inscription', pseudo }  → ouvre le portefeuille du mois (10 M FCFA fictifs) ou change le pseudo
   POST { action: 'ordre', stock, qty }    → achat (qty > 0) ou vente (qty < 0) au cours simulé du jour */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail, requireUser, audit } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';
import { joinContest, placeOrder, ofMonth } from '../../../lib/vp-contest';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inscription'), pseudo: z.string().trim().min(2).max(30) }),
  z.object({ action: z.literal('ordre'), stock: z.string().min(1).max(120), qty: z.number().int().min(-1_000_000).max(1_000_000).refine((q) => q !== 0) }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'concours', 60, 600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.path[0] === 'pseudo' ? 'Pseudo : 2 à 30 caractères.' : 'Ordre invalide.');
  if (p.data.action === 'inscription') {
    const month = await joinContest(u.id, p.data.pseudo);
    await audit(u.id, 'kapital.concours.inscription', month);
    return json({ ok: true, message: `Vous participez au concours ${ofMonth(month)}. Bonne chance !` });
  }
  const r = await placeOrder(u.id, p.data.stock, p.data.qty);
  if ('error' in r) return fail(r.error);
  const n = Math.abs(p.data.qty);
  return json({ ok: true, ...r, message: `${p.data.qty > 0 ? 'Achat fictif' : 'Vente fictive'} de ${n} titre${n > 1 ? 's' : ''} à ${r.price.toLocaleString('fr-FR')} FCFA.` });
};
