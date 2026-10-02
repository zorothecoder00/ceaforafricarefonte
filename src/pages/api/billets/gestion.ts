/* Gestion de ses billets (CDC §7.3) : renvoi, transfert, annulation / remboursement selon les conditions.
   POST { action: 'renvoyer' | 'transferer' | 'annuler', code, name?, email? } — connexion requise, billet du compte. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { eventTicket } from '../../../db/schema/app';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { rateLimit } from '../../../lib/guard';
import { cancelTicket, contactOf, deliverTickets, rules, transferTicket, REFUND_DAYS } from '../../../lib/tickets';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('renvoyer'), code: z.string().max(40) }),
  z.object({ action: z.literal('annuler'), code: z.string().max(40) }),
  z.object({ action: z.literal('transferer'), code: z.string().max(40), name: z.string().trim().min(2).max(120), email: z.email() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const limited = rateLimit(request, 'billet-gestion:' + u.id, 20, 3600);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Indiquez le nom et un e-mail valide.');
  const [t] = await db.select().from(eventTicket).where(and(eq(eventTicket.code, p.data.code), eq(eventTicket.userId, u.id)));
  if (!t) return fail('Billet introuvable.', 404);
  const r = rules(t);
  switch (p.data.action) {
    case 'renvoyer':
      if (t.status !== 'valide') return fail('Ce billet n’est plus valide.');
      await deliverTickets([t], await contactOf(u.id));
      return json({ ok: true, message: 'Billet renvoyé par e-mail (et WhatsApp si votre numéro est vérifié).' });
    case 'transferer': {
      if (!r.canTransfer) return fail('Ce billet ne peut plus être transféré (déjà utilisé, annulé ou événement passé).');
      if (p.data.email.toLowerCase() === u.email.toLowerCase()) return fail('Indiquez l’adresse de la personne bénéficiaire.');
      const n = await transferTicket(t, { name: p.data.name, email: p.data.email });
      if (!n) return fail('Transfert impossible : le billet vient d’être utilisé ou modifié.', 409);
      await audit(u.id, 'billet.transfert', t.code, { nouveauCode: n.code, vers: p.data.email.toLowerCase() }, clientIp(request));
      return json({ ok: true, message: `Billet transféré à ${p.data.name}. L’ancien QR code n’est plus valable.`, redirect: '/espace/billets' });
    }
    case 'annuler': {
      if (!r.canCancel) return fail(r.refund && r.days >= 0 && r.days < REFUND_DAYS ? `Les billets payants sont remboursables jusqu’à ${REFUND_DAYS} jours avant l’événement : vous pouvez encore le transférer.` : 'Ce billet ne peut plus être annulé.');
      const n = await cancelTicket(t, u.id);
      if (!n) return fail('Annulation impossible : le billet vient d’être utilisé ou modifié.', 409);
      await audit(u.id, r.refund ? 'billet.remboursement' : 'billet.annulation', t.code, { prix: t.priceXof }, clientIp(request));
      return json({ ok: true, message: r.refund ? `Billet annulé. Remboursement de ${t.priceXof.toLocaleString('fr-FR')} FCFA sous 10 jours ouvrés sur votre moyen de paiement.` : 'Inscription annulée : la place est proposée à la liste d’attente.', redirect: '/espace/billets' });
    }
  }
};
