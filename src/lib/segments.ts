/* Segments dynamiques du CRM (CDC §12) : des règles évaluées au moment de l'usage (aperçu, envoi d'une campagne).
   Sources : membres (compte), contacts externes du CRM, abonnés confirmés à la lettre d'information.
   Chaque destinataire porte son consentement marketing et sa relation (billet, inscription) : c'est la campagne qui décide
   qui peut recevoir quoi (voir eligible()). Une même adresse e-mail n'apparaît qu'une fois (le membre l'emporte). */
import { z } from 'zod';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from './db';
import { user } from '../db/schema/auth';
import { profile, consent, membership, userRole, eventTicket, enrollment, newsletterSubscription, pushSubscription } from '../db/schema/app';
import { crmContact, crmOrg } from '../db/schema/crm';
import { ROLES } from './rbac';
import { norm } from './fuzzy';

export const Rules = z.object({
  source: z.enum(['membres', 'contacts', 'lettre', 'tous']).default('membres'),
  countries: z.array(z.string().length(2)).max(60).default([]),
  sectors: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  roles: z.array(z.enum(ROLES)).max(20).default([]),
  plans: z.array(z.enum(['membre', 'premium', 'entreprise'])).max(3).default([]),
  eventId: z.string().max(10).nullish(),
  courseId: z.string().max(10).nullish(),
  lang: z.enum(['fr', 'en']).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  orgKinds: z.array(z.string().max(20)).max(10).default([]),
});
export type Rules = z.infer<typeof Rules>;

export type Recipient = {
  key: string; // u:<membre>, c:<contact>, n:<abonné>
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  lang: string;
  country: string | null;
  marketing: boolean; // consentement aux communications marketing
  relation: boolean; // relation existante avec l'objet du segment (billet, inscription) : messages de service permis
  push: boolean; // au moins un appareil abonné aux notifications
};

const realEmail = (e: string | null | undefined) => (e && !e.endsWith('@telephone.cea4africa.com') ? e.toLowerCase() : null);
const sectorOk = (r: Rules, s: string | null | undefined) => !r.sectors.length || (!!s && r.sectors.some((x) => norm(s).includes(norm(x))));

/** Évalue un segment. scope : pays autorisés (responsable pays) ; null = tous. */
export async function evaluate(rules: Rules, scope: string[] | null = null): Promise<Recipient[]> {
  const r = Rules.parse(rules);
  const countryOk = (c: string | null | undefined) => (!r.countries.length || (!!c && r.countries.includes(c))) && (!scope || (!!c && scope.includes(c)));
  const memberOnly = r.roles.length || r.plans.length || r.eventId || r.courseId;
  const out = new Map<string, Recipient>(); // par e-mail (ou clé si pas d'e-mail)
  const put = (x: Recipient) => {
    const k = x.email ?? x.key;
    const cur = out.get(k);
    if (!cur) out.set(k, x);
    else if (cur.key.startsWith('u:')) cur.marketing ||= x.marketing; // un membre abonné à la lettre a consenti à la recevoir
    else if (x.key.startsWith('u:')) out.set(k, { ...x, marketing: x.marketing || cur.marketing });
  };

  if (r.source === 'membres' || r.source === 'tous') {
    const rows = await db.select({ id: user.id, name: user.name, email: user.email, phone: user.phoneNumber, country: profile.country, sector: profile.sector, lang: profile.lang })
      .from(user).leftJoin(profile, eq(profile.userId, user.id));
    const ids = rows.map((x) => x.id);
    const pick = async <T,>(q: Promise<T[]>) => (ids.length ? q : Promise.resolve([] as T[]));
    const [roles, plans, consents, tickets, enrolls, pushes] = await Promise.all([
      r.roles.length ? pick(db.select({ u: userRole.userId, role: userRole.role }).from(userRole).where(inArray(userRole.role, r.roles))) : Promise.resolve([]),
      r.plans.length ? pick(db.select({ u: membership.userId }).from(membership).where(and(eq(membership.status, 'active'), inArray(membership.plan, r.plans)))) : Promise.resolve([]),
      pick(db.select({ u: consent.userId, granted: consent.granted }).from(consent).where(eq(consent.kind, 'marketing')).orderBy(desc(consent.at))),
      r.eventId ? pick(db.select({ u: eventTicket.userId }).from(eventTicket).where(and(eq(eventTicket.eventId, r.eventId), inArray(eventTicket.status, ['valide', 'utilise'])))) : Promise.resolve([]),
      r.courseId ? pick(db.select({ u: enrollment.userId }).from(enrollment).where(eq(enrollment.courseId, r.courseId))) : Promise.resolve([]),
      pick(db.select({ u: pushSubscription.userId }).from(pushSubscription)),
    ]);
    const has = (list: { u: string | null }[]) => new Set(list.map((x) => x.u));
    const roleSet = has(roles), planSet = has(plans), ticketSet = has(tickets), enrolSet = has(enrolls), pushSet = has(pushes);
    const lastConsent = new Map<string, boolean>();
    for (const c of consents) if (!lastConsent.has(c.u)) lastConsent.set(c.u, c.granted); // trié du plus récent au plus ancien
    for (const m of rows) {
      if (!countryOk(m.country) || !sectorOk(r, m.sector) || (r.lang && (m.lang ?? 'fr') !== r.lang)) continue;
      if (r.roles.length && !roleSet.has(m.id)) continue;
      if (r.plans.length && !planSet.has(m.id)) continue;
      if (r.eventId && !ticketSet.has(m.id)) continue;
      if (r.courseId && !enrolSet.has(m.id)) continue;
      put({ key: `u:${m.id}`, userId: m.id, name: m.name, email: realEmail(m.email), phone: m.phone ?? null, lang: m.lang ?? 'fr', country: m.country ?? null,
        marketing: lastConsent.get(m.id) === true, relation: !!(r.eventId || r.courseId), push: pushSet.has(m.id) });
    }
  }

  if (!memberOnly && (r.source === 'contacts' || r.source === 'tous')) {
    const rows = await db.select({ c: crmContact, kind: crmOrg.kind }).from(crmContact).leftJoin(crmOrg, eq(crmOrg.id, crmContact.orgId));
    for (const { c, kind } of rows) {
      if (!countryOk(c.country) || !sectorOk(r, c.sector) || (r.lang && c.lang !== r.lang)) continue;
      if (r.tags.length && !r.tags.some((t) => c.tags.includes(t))) continue;
      if (r.orgKinds.length && (!kind || !r.orgKinds.includes(kind))) continue;
      put({ key: `c:${c.id}`, userId: null, name: c.name, email: realEmail(c.email), phone: c.phone, lang: c.lang, country: c.country, marketing: c.marketingConsent, relation: false, push: false });
    }
  }

  if (!memberOnly && !r.tags.length && !r.orgKinds.length && !r.sectors.length && (r.source === 'lettre' || r.source === 'tous')) {
    const rows = await db.select().from(newsletterSubscription).where(and(isNotNull(newsletterSubscription.confirmedAt), isNull(newsletterSubscription.unsubscribedAt)));
    for (const n of rows) {
      if (!countryOk(n.country) || (r.lang && n.lang !== r.lang)) continue;
      put({ key: `n:${n.id}`, userId: null, name: '', email: n.email.toLowerCase(), phone: null, lang: n.lang, country: n.country, marketing: true, relation: false, push: false });
    }
  }
  return [...out.values()];
}

export type Channel = 'email' | 'sms' | 'whatsapp' | 'push';
/** Peut-on écrire à ce destinataire sur ce canal, pour cet usage ? (consentement ou relation, et adresse disponible) */
export function eligible(x: Recipient, channel: Channel, purpose: 'marketing' | 'service') {
  if (purpose === 'marketing' ? !x.marketing : !x.relation) return false;
  if (channel === 'email') return !!x.email;
  if (channel === 'push') return x.push;
  return !!x.phone;
}

/** Résumé d'un segment pour l'aperçu : total, joignables par canal (marketing et service). */
export function summarize(list: Recipient[]) {
  const n = (ch: Channel, p: 'marketing' | 'service') => list.filter((x) => eligible(x, ch, p)).length;
  return {
    total: list.length,
    marketing: { email: n('email', 'marketing'), sms: n('sms', 'marketing'), whatsapp: n('whatsapp', 'marketing'), push: n('push', 'marketing') },
    service: { email: n('email', 'service'), sms: n('sms', 'service'), whatsapp: n('whatsapp', 'service'), push: n('push', 'service') },
  };
}
