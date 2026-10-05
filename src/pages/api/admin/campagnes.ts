/* API des campagnes (CDC §12). Droits : objet « campagnes » (§18) — C/M pour préparer, V pour envoyer ou programmer.
   POST { action, … } :
   - create { name, channel, purpose, templateId? } → brouillon
   - save { id, …contenu }                          → enregistrement (brouillon ou programmée uniquement)
   - preview { id }                                 → destinataires éligibles (total, A/B)
   - test { id, variant }                           → envoi d'essai à la personne connectée
   - schedule { id, at } / unschedule { id }        → programmation (droit V) ; envoi par la tâche planifiée
   - send { id }                                    → préparation + premier lot (droit V) ; continue { id } → lot suivant
   - cancel { id }                                  → arrêt d'un envoi en cours (les messages partis le restent)
   - duplicate { id } · template.save { id, name } · template.delete { id } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { campaign, campaignTemplate, crmSegment } from '../../../db/schema/crm';
import { pushSubscription } from '../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { audience, prepare, processBatch, variantOf, personalize, emailHtml } from '../../../lib/campaigns';
import { Rules } from '../../../lib/segments';
import { sendEmail, sendSms, sendWhatsApp } from '../../../lib/messaging';
import { sendPush } from '../../../lib/push';

export const prerender = false;

const id = z.uuid();
const Channel = z.enum(['email', 'sms', 'whatsapp', 'push']);
const txt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(2).max(120), channel: Channel, purpose: z.enum(['marketing', 'service']).default('marketing'), templateId: z.uuid().nullish().or(z.literal('')).transform((v) => v || null) }),
  z.object({
    action: z.literal('save'), id, name: z.string().trim().min(2).max(120), purpose: z.enum(['marketing', 'service']), segmentId: z.uuid().nullish().or(z.literal('')).transform((v) => v || null),
    subject: txt(160), body: z.string().max(20000), url: z.url().max(500).nullish().or(z.literal('')).transform((v) => v || null),
    subjectB: txt(160), bodyB: z.string().max(20000).nullish().transform((v) => v || null), splitB: z.coerce.number().int().min(0).max(50),
  }),
  z.object({ action: z.literal('preview'), id }),
  z.object({ action: z.literal('test'), id, variant: z.enum(['A', 'B']).default('A') }),
  z.object({ action: z.literal('schedule'), id, at: z.iso.datetime({ offset: true }) }),
  z.object({ action: z.literal('unschedule'), id }),
  z.object({ action: z.literal('send'), id }),
  z.object({ action: z.literal('continue'), id }),
  z.object({ action: z.literal('cancel'), id }),
  z.object({ action: z.literal('duplicate'), id }),
  z.object({ action: z.literal('template.save'), id, name: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal('template.delete'), id }),
]);

const LIMITS = { sms: 480, whatsapp: 1500, push: 180 } as const; // longueurs raisonnables par canal (SMS : 3 segments)

/** Contrôles avant envoi ou programmation ; renvoie le message d'erreur ou null. */
async function ready(c: typeof campaign.$inferSelect) {
  if (!c.segmentId) return 'Choisissez un segment.';
  if (!c.body.trim()) return 'Le message est vide.';
  if ((c.channel === 'email' || c.channel === 'push') && !c.subject?.trim()) return c.channel === 'email' ? "Indiquez l'objet de l'e-mail." : 'Indiquez le titre de la notification.';
  if (c.channel !== 'email' && c.body.length > LIMITS[c.channel]) return `Message trop long pour ce canal (${LIMITS[c.channel]} caractères au plus).`;
  if (c.splitB > 0 && !c.bodyB?.trim() && !c.subjectB?.trim()) return 'Test A/B : renseignez la variante B (objet ou message).';
  if (c.purpose === 'service') {
    const [seg] = await db.select({ rules: crmSegment.rules }).from(crmSegment).where(eq(crmSegment.id, c.segmentId));
    const r = Rules.safeParse(seg?.rules);
    if (!r.success || (!r.data.eventId && !r.data.courseId)) return 'Un message de service doit viser les participants d’un événement ou les inscrits d’un cours (segment avec événement ou cours).';
  }
  return null;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => i.message).join(', '));
  const b = p.data;
  const ip = clientIp(request);
  const need = ['schedule', 'unschedule', 'send', 'continue', 'cancel', 'template.delete'].includes(b.action) ? 'V' : b.action === 'preview' ? 'L' : b.action === 'create' || b.action === 'duplicate' ? 'C' : 'M';
  const u = staffApi(locals.user, 'campagnes', need);
  if (u instanceof Response) return u;

  if (b.action === 'create') {
    const [t] = b.templateId ? await db.select().from(campaignTemplate).where(eq(campaignTemplate.id, b.templateId)) : [];
    if (t && t.channel !== b.channel) return fail('Ce modèle est prévu pour un autre canal.');
    const [n] = await db.insert(campaign).values({ name: b.name, channel: b.channel, purpose: b.purpose, subject: t?.subject ?? null, body: t?.body ?? '', createdBy: u.id }).returning({ id: campaign.id });
    await audit(u.id, 'campagne.creation', n.id, { channel: b.channel }, ip);
    return json({ ok: true, redirect: `/admin/campagnes/${n.id}`, message: 'Brouillon créé.' });
  }
  if (b.action === 'template.delete') {
    await db.delete(campaignTemplate).where(eq(campaignTemplate.id, b.id));
    return json({ ok: true, message: 'Modèle supprimé.' });
  }

  const [c] = await db.select().from(campaign).where(eq(campaign.id, b.id));
  if (!c) return fail('Campagne introuvable.', 404);
  const editable = c.status === 'brouillon' || c.status === 'programmee';

  switch (b.action) {
    case 'save': {
      if (!editable) return fail("Cette campagne est déjà partie : dupliquez-la pour en préparer une nouvelle.");
      const { action: _a, id: _i, ...f } = b;
      // Une modification annule la programmation : l'envoi doit être revalidé
      await db.update(campaign).set({ ...f, ...(c.status === 'programmee' ? { status: 'brouillon', scheduledAt: null, approvedBy: null } : {}), updatedAt: new Date() }).where(eq(campaign.id, c.id));
      return json({ ok: true, message: c.status === 'programmee' ? 'Enregistré. La programmation est annulée : revalidez l’envoi.' : 'Enregistré.' });
    }
    case 'preview': {
      const list = await audience(c);
      return json({ ok: true, count: list.length, abB: c.splitB > 0 ? Math.round((list.length * c.splitB) / 100) : 0 });
    }
    case 'test': {
      const v = variantOf(c, b.variant);
      const body = personalize(v.body, { name: u.name });
      const fake = { id: '00000000-0000-4000-8000-000000000000', campaignId: c.id, recipientKey: `u:${u.id}`, address: u.email, name: u.name, variant: b.variant, status: 'envoye', error: null, sentAt: null, openedAt: null, clickedAt: null, unsubscribedAt: null };
      try {
        if (c.channel === 'email') await sendEmail(u.email, `[TEST] ${personalize(v.subject, { name: u.name })}`, body, emailHtml(c, fake, body));
        else if (c.channel === 'push') {
          const [sub] = await db.select({ id: pushSubscription.id }).from(pushSubscription).where(eq(pushSubscription.userId, u.id)).limit(1);
          if (!sub) return fail('Activez d’abord les notifications push sur votre appareil (Mon espace › Notifications).');
          await sendPush(u.id, { title: `[TEST] ${v.subject}`, body, url: c.url || '/' });
        } else {
          if (!u.phoneNumber) return fail('Ajoutez un numéro de téléphone vérifié à votre compte pour recevoir le test.');
          await (c.channel === 'sms' ? sendSms : sendWhatsApp)(u.phoneNumber, `[TEST] ${body}${c.url ? ` ${c.url}` : ''}`);
        }
      } catch (e) { return fail(`Envoi d’essai impossible : ${e instanceof Error ? e.message : e}`, 502); }
      return json({ ok: true, message: `Essai (variante ${b.variant}) envoyé à ${c.channel === 'email' ? u.email : c.channel === 'push' ? 'vos appareils' : u.phoneNumber}.` });
    }
    case 'schedule': {
      if (!editable) return fail('Campagne déjà partie.');
      const err = await ready(c); if (err) return fail(err);
      const at = new Date(b.at);
      if (at <= new Date()) return fail('Choisissez une date à venir.');
      await db.update(campaign).set({ status: 'programmee', scheduledAt: at, approvedBy: u.id, updatedAt: new Date() }).where(eq(campaign.id, c.id));
      await audit(u.id, 'campagne.programmation', c.id, { at: at.toISOString() }, ip);
      return json({ ok: true, message: 'Campagne programmée.' });
    }
    case 'unschedule': {
      if (c.status !== 'programmee') return fail('Cette campagne n’est pas programmée.');
      await db.update(campaign).set({ status: 'brouillon', scheduledAt: null, approvedBy: null, updatedAt: new Date() }).where(eq(campaign.id, c.id));
      return json({ ok: true, message: 'Programmation annulée.' });
    }
    case 'send': {
      if (!editable) return fail('Campagne déjà partie.');
      const err = await ready(c); if (err) return fail(err);
      await db.update(campaign).set({ approvedBy: u.id }).where(eq(campaign.id, c.id));
      const n = await prepare({ ...c, approvedBy: u.id });
      if (!n) { await db.update(campaign).set({ status: 'brouillon' }).where(eq(campaign.id, c.id)); return fail('Aucun destinataire éligible dans ce segment pour ce canal (consentement, adresse ou appareil manquants).'); }
      await audit(u.id, 'campagne.envoi', c.id, { recipients: n, channel: c.channel, purpose: c.purpose }, ip);
      return json({ ok: true, total: n, ...(await processBatch(c.id)) });
    }
    case 'continue': {
      if (c.status !== 'envoi') return json({ ok: true, done: true, sent: 0, failed: 0, left: 0 });
      return json({ ok: true, ...(await processBatch(c.id)) });
    }
    case 'cancel': {
      if (c.status !== 'envoi') return fail('Aucun envoi en cours.');
      await db.update(campaign).set({ status: 'annulee', updatedAt: new Date() }).where(eq(campaign.id, c.id));
      await audit(u.id, 'campagne.arret', c.id, {}, ip);
      return json({ ok: true, message: 'Envoi arrêté. Les messages déjà partis le restent.' });
    }
    case 'duplicate': {
      const [n] = await db.insert(campaign).values({ name: `${c.name} (copie)`, channel: c.channel, purpose: c.purpose, segmentId: c.segmentId, subject: c.subject, body: c.body, url: c.url, subjectB: c.subjectB, bodyB: c.bodyB, splitB: c.splitB, createdBy: u.id }).returning({ id: campaign.id });
      return json({ ok: true, redirect: `/admin/campagnes/${n.id}`, message: 'Copie créée.' });
    }
    case 'template.save': {
      await db.insert(campaignTemplate).values({ name: b.name, channel: c.channel, subject: c.subject, body: c.body, createdBy: u.id });
      return json({ ok: true, message: 'Modèle enregistré.' });
    }
  }
};
