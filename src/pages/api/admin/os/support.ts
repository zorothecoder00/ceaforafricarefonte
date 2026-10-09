/* CEA OS — support, documents, conformité KYC (prototype : Support, Documents, Conformité KYC).
   POST JSON ou multipart { action, … } :
   ticket.create { title, category, priority, text } · ticket.status { id, status } (ticket interne) · site.status { id, status } (message du site)
   doc.upload { domain, confidentiality, file } (nouvelle version si le nom existe) · doc.share { id, email, days }
   kyc.decide { userId, status: verifie | refuse | en_cours } (profils dg, conf) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osTicket, osDocument, osDocShare, osDocVersion } from '../../../../db/schema/os';
import { contactMessage, userRole } from '../../../../db/schema/app';
import { investorProfile } from '../../../../db/schema/kapital';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, canUse, MANAGERS, scopeState } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { notify } from '../../../../lib/notify';
import { sendEmail } from '../../../../lib/messaging';
import { readStoredFile, storeFile } from '../../../../lib/storage';
import { canSeeDoc, CONF } from '../../../../lib/os/support';
import { DK, dstr } from '../../../../lib/os/ref';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ticket.create'), title: z.string().trim().min(3, 'Indiquez l’objet.').max(200), category: z.enum(['Informatique', 'Logistique', 'Accès et droits', 'Finance', 'Autre']), priority: z.enum(['P1', 'P2', 'P3']), text: z.string().trim().max(4000).default('') }),
  z.object({ action: z.literal('ticket.status'), id: z.string().max(20), status: z.enum(['Ouvert', 'En cours', 'Résolu']) }),
  z.object({ action: z.literal('site.status'), id: z.uuid(), status: z.enum(['Ouvert', 'En cours', 'Résolu']) }),
  z.object({ action: z.literal('doc.upload'), domain: z.enum(DK as [string, ...string[]]), confidentiality: z.enum(CONF) }),
  z.object({ action: z.literal('doc.share'), id: z.uuid(), email: z.email('Adresse e-mail invalide.'), days: z.coerce.number().int().refine((d) => [1, 7, 30].includes(d)) }),
  z.object({ action: z.literal('kyc.decide'), userId: z.string().min(1).max(64), status: z.enum(['verifie', 'refuse', 'en_cours']) }),
]);

export const POST: APIRoute = async ({ locals, request, cookies, url }) => {
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData().catch(() => null) : null;
  const raw = form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) : await request.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const c = await osApi(locals.user, b.action === 'kyc.decide' ? 'dg conf' : undefined, ['ticket.create', 'doc.upload'].includes(b.action));
  if (c instanceof Response) return c;
  const actor = locals.user!.id, me = c.me;
  const people = await allStaff();
  const sc = scopeState(c, cookies);
  const isIT = ['it', 'dg'].includes(c.prof ?? '') || c.superuser;

  switch (b.action) {
    case 'ticket.create': {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osTicket);
      const id = `TK-${311 + n}`;
      await db.insert(osTicket).values({ id, title: b.title, category: b.category, priority: b.priority, text: b.text, byStaff: me!.id, country: me!.country, domain: me!.domain ?? 'prj' });
      await notifyStaff(people.filter((s) => s.prof === 'it' && s.active).map((s) => s.id), `Nouveau ticket ${b.priority} : ${b.title}`, '/os/support', people);
      await audit(actor, 'os.ticket.creation', id, { priorite: b.priority });
      return json({ ok: true, message: `Ticket ${id} créé ; l'équipe support est notifiée.` });
    }
    case 'ticket.status': {
      const [t] = await db.select().from(osTicket).where(eq(osTicket.id, b.id));
      if (!t) return fail('Ticket introuvable.', 404);
      if (!isIT && !(canUse(MANAGERS, c) && sc.inScope({ country: t.country, domain: t.domain }))) return fail('Accès refusé.', 403);
      await db.update(osTicket).set({ status: b.status, updatedAt: new Date() }).where(eq(osTicket.id, t.id));
      if (t.byStaff) await notifyStaff([t.byStaff], `Votre ticket ${t.id} : ${b.status}`, '/os/support', people);
      await audit(actor, 'os.ticket.statut', t.id, { statut: b.status });
      return json({ ok: true, message: 'Ticket mis à jour ; demandeur notifié.' });
    }
    case 'site.status': {
      if (!isIT && !canUse(MANAGERS, c)) return fail('Accès refusé.', 403);
      const map = { Ouvert: 'nouveau', 'En cours': 'en_cours', Résolu: 'traite' } as const;
      const [m] = await db.update(contactMessage).set({ status: map[b.status] }).where(eq(contactMessage.id, b.id)).returning();
      if (!m) return fail('Message introuvable.', 404);
      await audit(actor, 'contact.statut', m.reference, { statut: map[b.status] });
      return json({ ok: true, message: 'Demande mise à jour.' });
    }
    case 'doc.upload': {
      const file = form?.get('file');
      if (!(file instanceof File) || !file.size) return fail('Choisissez un fichier.');
      let s;
      try { s = await storeFile(file, 'os/documents'); } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt refusé.'); }
      const name = file.name.slice(0, 200);
      const [ex] = await db.select().from(osDocument).where(eq(osDocument.name, name));
      // Empreinte du fichier déposé, conservée avec la version (DOC-02)
      const f = await readStoredFile(s.key);
      const sha256 = f ? createHash('sha256').update(f.body).digest('hex') : null;
      if (ex) {
        if (!canSeeDoc(ex, c)) return fail('Un document confidentiel porte déjà ce nom.', 403);
        if (['En validation', 'En signature'].includes(ex.status)) return fail(`Document ${ex.status.toLowerCase()} : attendez la fin du circuit avant d'en déposer une nouvelle version.`);
        await db.update(osDocument).set({ version: ex.version + 1, storageKey: s.key, mime: s.type, size: s.size, by: me!.id, kind: 'fichier', status: ex.status === 'Déposé' ? 'Déposé' : 'Brouillon', updatedAt: new Date() }).where(eq(osDocument.id, ex.id));
        await db.insert(osDocVersion).values({ documentId: ex.id, version: ex.version + 1, storageKey: s.key, mime: s.type, size: s.size, sha256, note: 'Nouveau dépôt', by: me!.id });
        await audit(actor, 'os.document.version', name, { version: ex.version + 1 });
        return json({ ok: true, message: `Nouvelle version enregistrée (v${ex.version + 1}) ; les précédentes restent dans l'historique.` });
      }
      const [nd] = await db.insert(osDocument).values({ name, domain: b.domain, country: me!.country, confidentiality: b.confidentiality, storageKey: s.key, mime: s.type, size: s.size, by: me!.id, owner: me!.id, status: 'Déposé' }).returning();
      await db.insert(osDocVersion).values({ documentId: nd.id, version: 1, storageKey: s.key, mime: s.type, size: s.size, sha256, note: 'Dépôt', by: me!.id });
      await audit(actor, 'os.document.depot', name, { confidentialite: b.confidentiality });
      return json({ ok: true, message: 'Document classé.' });
    }
    case 'doc.share': {
      const [d] = await db.select().from(osDocument).where(eq(osDocument.id, b.id));
      if (!d || !canSeeDoc(d, c)) return fail('Document introuvable.', 404);
      // La classification conditionne le partage (DOC-03) : jamais pour « Strictement confidentiel » ; 7 jours au plus et par un manager pour « Confidentiel »
      if (d.confidentiality === 'Strictement confidentiel') return fail('Un document strictement confidentiel ne se partage pas hors de CEA OS.', 403);
      if (d.confidentiality === 'Confidentiel' && (b.days > 7 || !canUse(MANAGERS + ' jur conf', c))) return fail('Document confidentiel : partage réservé aux managers, juristes et conformité, 7 jours au plus.', 403);
      if (['En validation', 'En signature'].includes(d.status)) return fail(`Document ${d.status.toLowerCase()} : partagez-le une fois le circuit terminé.`);
      const token = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + b.days * 864e5);
      await db.insert(osDocShare).values({ token, documentId: d.id, email: b.email.toLowerCase(), expiresAt, by: actor });
      const link = new URL(`/api/os-partage/${token}`, process.env.BETTER_AUTH_URL ?? url.origin).href;
      const sent = await sendEmail(b.email, `Document partagé : ${d.name}`, `Bonjour,\n\nCEA FOR AFRICA vous partage le document « ${d.name} ».\nLien valable jusqu'au ${dstr(expiresAt)} : ${link}\n\n— CEA FOR AFRICA`).then(() => true, () => false);
      await audit(actor, 'os.document.partage', d.name, { destinataire: b.email, jours: b.days });
      return json({ ok: true, message: sent ? `Lien sécurisé envoyé, expiration le ${dstr(expiresAt)}.` : `Lien créé (l'e-mail n'a pas pu partir) : ${link}` });
    }
    case 'kyc.decide': {
      const review = new Date(); review.setFullYear(review.getFullYear() + 1);
      const res = await db.update(investorProfile).set({ kycStatus: b.status, ...(b.status === 'verifie' && { verifiedAt: new Date(), nextReviewAt: review }) }).where(eq(investorProfile.userId, b.userId)).returning();
      if (!res.length) return fail('Profil investisseur introuvable.', 404);
      if (b.status === 'verifie') await db.insert(userRole).values({ userId: b.userId, role: 'investisseur', grantedBy: actor }).onConflictDoNothing();
      await notify(b.userId, b.status === 'verifie' ? 'Votre profil investisseur est vérifié : les opportunités détaillées vous sont ouvertes.' : b.status === 'refuse' ? "Votre vérification investisseur n'a pas abouti. Contactez l'équipe conformité." : 'Merci de compléter les pièces de votre vérification investisseur.', '/kapital/investisseur', { email: true });
      await audit(actor, 'conformite.investisseur.' + b.status, b.userId);
      return json({ ok: true, message: b.status === 'verifie' ? 'Investisseur vérifié.' : b.status === 'refuse' ? 'Vérification refusée.' : 'Pièces demandées.' });
    }
  }
  return fail('Action inconnue.');
};
