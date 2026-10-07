/* CEA OS — recherche globale (prototype › openSearch, Ctrl+K) : collègues, contacts, dossiers Kapital, chantiers, factures,
   demandes, inscriptions ; les résultats respectent les droits et le périmètre de l'utilisateur. GET ?q=… */
import type { APIRoute } from 'astro';
import { desc, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osRequest, osSite, osInscription } from '../../../../db/schema/os';
import { crmContact } from '../../../../db/schema/crm';
import { dossier } from '../../../../db/schema/kapital';
import { invoice } from '../../../../db/schema/finance';
import { json } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, canUse, scopeState, MANAGERS } from '../../../../lib/os/core';
import { can, isStaff } from '../../../../lib/rbac';
import { domSpec } from '../../../../lib/os/domaines';
import { RTYPE, fcfa, refT, type ReqType } from '../../../../lib/os/ref';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url, cookies }) => {
  const c = await osApi(locals.user);
  if (c instanceof Response) return c;
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return json({ ok: true, results: [] });
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const sc = scopeState(c, cookies);
  const roles = locals.user!.roles;
  const res: [string, string, string][] = [];
  const s = q.toLowerCase();
  for (const x of (await allStaff()).filter((x) => x.active && (x.name + refT(x.poste)).toLowerCase().includes(s)).slice(0, 5)) res.push(['Collègue', `${x.name} · ${refT(x.poste)}`, '/admin/annuaire']);
  if (isStaff(roles) && can(roles, 'crm', 'L')) for (const x of await db.select().from(crmContact).where(or(ilike(crmContact.name, like), ilike(crmContact.email, like), ilike(crmContact.phone, like))).limit(6)) if (sc.inScope({ country: x.country })) res.push(['Contact', `${x.name}${x.email ? ' · ' + x.email : ''}`, `/admin/crm/personne/c-${x.id}`]);
  if (canUse(domSpec('kap'), c)) for (const x of await db.select().from(dossier).where(or(ilike(dossier.companyName, like), ilike(dossier.reference, like))).limit(5)) if (sc.inScope({ country: x.country })) res.push(['Dossier Kapital', `${x.companyName} · ${x.reference}`, `/admin/kapital/${x.id}`]);
  if (canUse(domSpec('btp'), c)) for (const x of await db.select().from(osSite).where(or(ilike(osSite.name, like), ilike(osSite.id, like))).limit(5)) if (sc.inScope({ country: x.country })) res.push(['Chantier', x.name, `/admin/dom/btp/${x.id}`]);
  if (canUse('dg fin dirreg rep chef', c)) for (const x of await db.select().from(invoice).where(or(ilike(invoice.number, like), sql`${invoice.buyer}->>'name' ilike ${like}`)).orderBy(desc(invoice.issuedAt)).limit(5)) if (sc.inScope({ country: x.country, domain: x.domain })) res.push(['Facture', `${x.number} · ${(x.buyer as { name?: string }).name ?? ''} · ${fcfa(x.totalXof)}`, '/admin/tresorerie?t=fac']);
  if (c.me) for (const x of await db.select().from(osRequest).where(or(ilike(osRequest.id, like), ilike(osRequest.title, like))).orderBy(desc(osRequest.createdAt)).limit(10)) {
    if (x.byStaff !== c.me.id && !(canUse(MANAGERS, c) && sc.inScope({ country: x.country, domain: x.domain }))) continue;
    res.push([RTYPE[x.type as ReqType] ?? x.type, `${x.id} · ${x.title} · ${x.status}`, x.byStaff === c.me.id ? '/admin/moi' : '/admin/approbations']);
  }
  if (canUse('dg dirreg rep agent conf com', c)) for (const x of await db.select().from(osInscription).where(or(ilike(osInscription.id, like), ilike(osInscription.name, like), ilike(osInscription.company, like))).limit(5)) if (sc.inScope({ country: x.country, domain: x.domains })) res.push(['Inscription', `${x.id} · ${x.name} · ${x.status}`, '/admin/inscriptions']);
  return json({ ok: true, results: res.slice(0, 30) });
};
