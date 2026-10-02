/* Soumission d'un dossier de levée de fonds (CDC §8.3) : formulaire en étapes, accusé avec numéro, dossier privé par défaut. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { dossier, dossierEvent } from '../../../db/schema/kapital';
import { userRole, consent } from '../../../db/schema/app';
import { json, fail, requireUser, reference, audit, clientIp } from '../../../lib/session';
import { INSTRUMENTS } from '../../../lib/kapital';
import { notify } from '../../../lib/notify';

export const prerender = false;

const Body = z.object({
  entreprise: z.string().trim().min(2).max(140),
  pays: z.string().length(2),
  rccm: z.string().trim().max(60).optional(),
  secteur: z.string().trim().max(80).optional(),
  montant: z.coerce.number().int().positive().max(1e13),
  instrument: z.string().optional(),
  usage: z.string().trim().max(3000).optional(),
  attest: z.literal(true, { message: 'attestation' }),
  kyb: z.literal(true, { message: 'kyb' }),
  partage: z.boolean().default(false),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues.some((i) => ['attestation', 'kyb'].includes(i.message)) ? 'Les deux premières cases de consentement sont obligatoires.' : 'Vérifiez le nom de l’entreprise, le pays et le montant.');
  const d = p.data;
  const ref = reference('D');
  const [row] = await db.insert(dossier).values({
    reference: ref, ownerId: u.id, companyName: d.entreprise, country: d.pays, rccm: d.rccm, sector: d.secteur,
    amountXof: d.montant, instrument: d.instrument ? INSTRUMENTS[d.instrument] : undefined, useOfFunds: d.usage, shareConsent: d.partage,
  }).returning({ id: dossier.id });
  await db.insert(dossierEvent).values({ dossierId: row.id, toStatus: 'recu', actorId: u.id, note: 'Dossier soumis' });
  await db.insert(userRole).values({ userId: u.id, role: 'entrepreneur' }).onConflictDoNothing();
  await db.insert(consent).values({ userId: u.id, kind: 'partage_investisseurs', granted: d.partage, ip: clientIp(request) });
  await audit(u.id, 'kapital.dossier.soumission', ref, {}, clientIp(request));
  await notify(u.id, `Dossier ${ref} reçu. Un analyste vous contacte sous 5 jours ouvrés.`, '/kapital/entreprise', { email: true, whatsapp: true });
  return json({ ok: true, reference: ref, redirect: '/kapital/entreprise' });
};
