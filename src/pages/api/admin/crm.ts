/* API du CRM 360° (CDC §12). Droits : objet « crm » (§18). Un responsable pays n'agit que sur les contacts et organisations de ses pays.
   POST { action, … } :
   - contact.save { id?, …fiche }          → crée ou met à jour un contact externe (consentement : base légale obligatoire)
   - contact.delete { id }                 → effacement (droit V ; demande d'effacement RGPD)
   - org.save { id?, …fiche } / org.delete → organisations
   - interaction.add { userId? | contactId? | orgId?, dealId?, kind, summary, at? }
   - deal.save { id?, …fiche, programme? } / deal.stage { id, stage } → pipeline partenaires et sponsors (chaque changement d'étape est historisé ; programme = programme cofinancé)
   - segment.save { id?, name, description?, rules } / segment.delete { id } / segment.preview { rules } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { crmContact, crmOrg, crmInteraction, crmDeal, crmSegment, crmOrgKindEnum, crmDealStageEnum } from '../../../db/schema/crm';
import { STAGE_LABEL } from '../../../lib/crm';
import { user } from '../../../db/schema/auth';
import { profile } from '../../../db/schema/app';
import { json, fail, audit, clientIp, type CurrentUser } from '../../../lib/session';
import { staffApi, countriesFor } from '../../../lib/admin';

import { Rules, evaluate, summarize } from '../../../lib/segments';

export const prerender = false;

const id = z.uuid();
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const Country = z.preprocess((v) => (v === '' ? null : v), z.string().length(2).nullish()).transform((v) => v || null);
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('contact.save'), id: id.optional(), name: z.string().trim().min(2).max(120), email: z.email().max(160).nullish().or(z.literal('')).transform((v) => v?.toLowerCase() || null),
    phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, 'Téléphone au format international').nullish().or(z.literal('')).transform((v) => v?.replace(/\s/g, '') || null),
    orgId: z.uuid().nullish().or(z.literal('')).transform((v) => v || null), role: opt(120), country: Country, sector: opt(60), lang: z.enum(['fr', 'en']).default('fr'),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]), source: opt(80), marketingConsent: z.boolean().default(false), consentBasis: opt(300), notes: opt(3000),
  }),
  z.object({ action: z.literal('contact.delete'), id }),
  z.object({ action: z.literal('org.save'), id: id.optional(), name: z.string().trim().min(2).max(160), kind: z.enum(crmOrgKindEnum.enumValues), country: Country, sector: opt(60), website: z.url().max(200).nullish().or(z.literal('')).transform((v) => v || null), notes: opt(3000) }),
  z.object({ action: z.literal('org.delete'), id }),
  z.object({ action: z.literal('interaction.add'), userId: z.string().max(64).nullish(), contactId: z.uuid().nullish(), orgId: z.uuid().nullish(), dealId: z.uuid().nullish(), kind: z.enum(['appel', 'reunion', 'email', 'note', 'evenement']), summary: z.string().trim().min(2).max(3000), at: z.iso.date().nullish() }),
  z.object({ action: z.literal('deal.save'), id: id.optional(), orgId: id, title: z.string().trim().min(2).max(160), kind: z.enum(['partenariat', 'sponsoring', 'subvention']), stage: z.enum(crmDealStageEnum.enumValues).default('prospect'), amountXof: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(0).nullish()), eventId: opt(10), programme: opt(80), expectedOn: z.iso.date().nullish().or(z.literal('')).transform((v) => v || null), notes: opt(3000) }),
  z.object({ action: z.literal('deal.stage'), id, stage: z.enum(crmDealStageEnum.enumValues) }),
  z.object({ action: z.literal('segment.save'), id: id.optional(), name: z.string().trim().min(2).max(120), description: opt(400), rules: Rules }),
  z.object({ action: z.literal('segment.delete'), id }),
  z.object({ action: z.literal('segment.preview'), rules: Rules }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => i.message).join(', '));
  const b = p.data;
  const ip = clientIp(request);
  const need = b.action.endsWith('.delete') ? 'V' : b.action === 'segment.preview' ? 'L' : b.action.endsWith('.save') && !('id' in b && b.id) ? 'C' : 'M';
  const u = staffApi(locals.user, 'crm', need);
  if (u instanceof Response) return u;
  const scope = await countriesFor(u, 'crm', need === 'L' ? 'L' : 'M'); // null = tous les pays
  const inScope = (c: string | null | undefined) => !scope || (!!c && scope.includes(c));
  const deny = () => fail('Hors de votre périmètre (pays).', 403);

  switch (b.action) {
    case 'contact.save': {
      const { action: _a, id: cid, ...f } = b;
      if (!inScope(f.country)) return deny();
      if (f.marketingConsent && !f.consentBasis) return fail('Précisez comment le consentement a été recueilli (formulaire, carte de visite avec accord écrit…).');
      if (f.email) { const [dup] = await db.select({ id: crmContact.id }).from(crmContact).where(and(eq(crmContact.email, f.email), cid ? ne(crmContact.id, cid) : undefined)); if (dup) return fail('Un contact existe déjà avec cette adresse e-mail.'); }
      if (cid) {
        const [cur] = await db.select().from(crmContact).where(eq(crmContact.id, cid));
        if (!cur) return fail('Contact introuvable.', 404);
        if (!inScope(cur.country)) return deny();
        const consentChanged = cur.marketingConsent !== f.marketingConsent;
        await db.update(crmContact).set({ ...f, ...(consentChanged ? { consentAt: new Date() } : {}), updatedAt: new Date() }).where(eq(crmContact.id, cid));
        if (consentChanged) await db.insert(crmInteraction).values({ contactId: cid, kind: 'note', summary: `Consentement marketing ${f.marketingConsent ? 'accordé' : 'retiré'}${f.consentBasis ? ` (${f.consentBasis})` : ''}.`, authorId: u.id });
        await audit(u.id, 'crm.contact.maj', cid, { consent: consentChanged ? f.marketingConsent : undefined }, ip);
        return json({ ok: true, message: 'Contact enregistré.' });
      }
      const [n] = await db.insert(crmContact).values({ ...f, consentAt: f.marketingConsent ? new Date() : null, ownerId: u.id }).returning({ id: crmContact.id });
      await audit(u.id, 'crm.contact.creation', n.id, {}, ip);
      return json({ ok: true, message: 'Contact créé.', redirect: `/admin/crm/personne/c-${n.id}` });
    }
    case 'contact.delete': {
      const [cur] = await db.select().from(crmContact).where(eq(crmContact.id, b.id));
      if (!cur) return fail('Contact introuvable.', 404);
      if (!inScope(cur.country)) return deny();
      await db.delete(crmContact).where(eq(crmContact.id, b.id)); // interactions supprimées en cascade (effacement)
      await audit(u.id, 'crm.contact.effacement', b.id, { name: cur.name }, ip);
      return json({ ok: true, message: 'Contact effacé, ainsi que son historique.', redirect: '/admin/crm' });
    }
    case 'org.save': {
      const { action: _a, id: oid, ...f } = b;
      if (!inScope(f.country)) return deny();
      if (oid) {
        const [cur] = await db.select({ c: crmOrg.country }).from(crmOrg).where(eq(crmOrg.id, oid));
        if (!cur) return fail('Organisation introuvable.', 404);
        if (!inScope(cur.c)) return deny();
        await db.update(crmOrg).set({ ...f, updatedAt: new Date() }).where(eq(crmOrg.id, oid));
        await audit(u.id, 'crm.org.maj', oid, {}, ip);
        return json({ ok: true, message: 'Organisation enregistrée.' });
      }
      const [n] = await db.insert(crmOrg).values({ ...f, ownerId: u.id }).returning({ id: crmOrg.id });
      await audit(u.id, 'crm.org.creation', n.id, {}, ip);
      return json({ ok: true, message: 'Organisation créée.', redirect: `/admin/crm/organisation/${n.id}` });
    }
    case 'org.delete': {
      const [cur] = await db.select().from(crmOrg).where(eq(crmOrg.id, b.id));
      if (!cur) return fail('Organisation introuvable.', 404);
      if (!inScope(cur.country)) return deny();
      await db.delete(crmOrg).where(eq(crmOrg.id, b.id));
      await audit(u.id, 'crm.org.suppression', b.id, { name: cur.name }, ip);
      return json({ ok: true, message: 'Organisation supprimée (ses contacts sont conservés).', redirect: '/admin/crm?vue=organisations' });
    }
    case 'interaction.add': {
      if (!b.userId && !b.contactId && !b.orgId) return fail('Interaction sans destinataire.');
      if (!(await subjectInScope(u, scope, b))) return deny();
      await db.insert(crmInteraction).values({ userId: b.userId ?? null, contactId: b.contactId ?? null, orgId: b.orgId ?? null, dealId: b.dealId ?? null, kind: b.kind, summary: b.summary, at: b.at ? new Date(`${b.at}T12:00:00Z`) : new Date(), authorId: u.id });
      return json({ ok: true, message: 'Interaction ajoutée.' });
    }
    case 'deal.save': {
      const { action: _a, id: did, ...f } = b;
      const [org] = await db.select({ c: crmOrg.country }).from(crmOrg).where(eq(crmOrg.id, f.orgId));
      if (!org) return fail('Organisation introuvable.', 404);
      if (!inScope(org.c)) return deny();
      if (did) {
        const [cur] = await db.select().from(crmDeal).where(eq(crmDeal.id, did));
        if (!cur) return fail('Opportunité introuvable.', 404);
        await db.update(crmDeal).set({ ...f, updatedAt: new Date() }).where(eq(crmDeal.id, did));
        if (cur.stage !== f.stage) await db.insert(crmInteraction).values({ orgId: f.orgId, dealId: did, kind: 'note', summary: `« ${f.title} » : ${STAGE_LABEL[cur.stage]} → ${STAGE_LABEL[f.stage]}`, authorId: u.id });
        await audit(u.id, 'crm.deal.maj', did, { stage: f.stage }, ip);
        return json({ ok: true, message: 'Opportunité enregistrée.' });
      }
      const [n] = await db.insert(crmDeal).values({ ...f, ownerId: u.id }).returning({ id: crmDeal.id });
      await db.insert(crmInteraction).values({ orgId: f.orgId, dealId: n.id, kind: 'note', summary: `Opportunité créée : « ${f.title} » (${STAGE_LABEL[f.stage]})`, authorId: u.id });
      await audit(u.id, 'crm.deal.creation', n.id, {}, ip);
      return json({ ok: true, message: 'Opportunité créée.' });
    }
    case 'deal.stage': {
      const [cur] = await db.select({ d: crmDeal, c: crmOrg.country }).from(crmDeal).innerJoin(crmOrg, eq(crmOrg.id, crmDeal.orgId)).where(eq(crmDeal.id, b.id));
      if (!cur) return fail('Opportunité introuvable.', 404);
      if (!inScope(cur.c)) return deny();
      if (cur.d.stage === b.stage) return json({ ok: true });
      await db.update(crmDeal).set({ stage: b.stage, updatedAt: new Date() }).where(eq(crmDeal.id, b.id));
      await db.insert(crmInteraction).values({ orgId: cur.d.orgId, dealId: b.id, kind: 'note', summary: `« ${cur.d.title} » : ${STAGE_LABEL[cur.d.stage]} → ${STAGE_LABEL[b.stage]}`, authorId: u.id });
      await audit(u.id, 'crm.deal.etape', b.id, { from: cur.d.stage, to: b.stage }, ip);
      return json({ ok: true, message: `Étape : ${STAGE_LABEL[b.stage]}.` });
    }
    case 'segment.save': {
      if (scope && b.rules.countries.some((c) => !scope.includes(c))) return deny();
      const rules = scope && !b.rules.countries.length ? { ...b.rules, countries: scope } : b.rules; // un responsable pays segmente dans ses pays
      if (b.id) {
        if (scope && !(await ownSegment(b.id, u.id))) return deny();
        await db.update(crmSegment).set({ name: b.name, description: b.description, rules, updatedAt: new Date() }).where(eq(crmSegment.id, b.id));
        await audit(u.id, 'crm.segment.maj', b.id, {}, ip);
        return json({ ok: true, message: 'Segment enregistré.' });
      }
      const [n] = await db.insert(crmSegment).values({ name: b.name, description: b.description, rules, createdBy: u.id }).returning({ id: crmSegment.id });
      await audit(u.id, 'crm.segment.creation', n.id, {}, ip);
      return json({ ok: true, message: 'Segment créé.', redirect: `/admin/crm?vue=segments&segment=${n.id}` });
    }
    case 'segment.delete': {
      if (scope && !(await ownSegment(b.id, u.id))) return deny();
      await db.delete(crmSegment).where(eq(crmSegment.id, b.id));
      await audit(u.id, 'crm.segment.suppression', b.id, {}, ip);
      return json({ ok: true, message: 'Segment supprimé.', redirect: '/admin/crm?vue=segments' });
    }
    case 'segment.preview': {
      const list = await evaluate(b.rules, scope);
      return json({ ok: true, summary: summarize(list), sample: list.slice(0, 8).map((x) => ({ name: x.name || x.email || x.phone, country: x.country, marketing: x.marketing })) });
    }
  }
};

/** Le membre, le contact ou l'organisation visés sont-ils dans le périmètre (pays) de la personne ? */
async function subjectInScope(_u: CurrentUser, scope: string[] | null, b: { userId?: string | null; contactId?: string | null; orgId?: string | null }) {
  if (!scope) return true;
  const ok = (c: string | null | undefined) => !!c && scope.includes(c);
  if (b.userId) { const [m] = await db.select({ c: profile.country }).from(user).leftJoin(profile, eq(profile.userId, user.id)).where(eq(user.id, b.userId)); if (!ok(m?.c)) return false; }
  if (b.contactId) { const [c] = await db.select({ c: crmContact.country }).from(crmContact).where(eq(crmContact.id, b.contactId)); if (!ok(c?.c)) return false; }
  if (b.orgId) { const [o] = await db.select({ c: crmOrg.country }).from(crmOrg).where(eq(crmOrg.id, b.orgId)); if (!ok(o?.c)) return false; }
  return true;
}

/** Un responsable pays ne modifie que les segments qu'il a créés. */
async function ownSegment(id: string, userId: string) {
  const [s] = await db.select({ by: crmSegment.createdBy }).from(crmSegment).where(eq(crmSegment.id, id));
  return s?.by === userId;
}
