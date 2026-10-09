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
import { matchAll } from '../../../../lib/fold';
import { search } from '../../../../lib/fuzzy';
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
  // Personnes : mots dans n'importe quel ordre, sans accents ni majuscules
  // (fautes de frappe tolérées pour les collègues, liste en mémoire)
  for (const x of search((await allStaff()).filter((x) => x.active), q, (x) => [x.name, `${refT(x.poste)} ${x.email}`], 5)) res.push(['Collègue', `${x.name} · ${refT(x.poste)}`, '/os/annuaire']);
  const cm = matchAll([crmContact.name, crmContact.email], q, crmContact.phone);
  if (cm && isStaff(roles) && can(roles, 'crm', 'L')) for (const x of await db.select().from(crmContact).where(cm).limit(6)) if (sc.inScope({ country: x.country })) res.push(['Contact', `${x.name}${x.email ? ' · ' + x.email : ''}`, `/os/crm/personne/c-${x.id}`]);
  if (canUse(domSpec('kap'), c)) for (const x of await db.select().from(dossier).where(or(ilike(dossier.companyName, like), ilike(dossier.reference, like))).limit(5)) if (sc.inScope({ country: x.country })) res.push(['Dossier Kapital', `${x.companyName} · ${x.reference}`, `/admin/kapital/${x.id}`]);
  if (canUse(domSpec('btp'), c)) for (const x of await db.select().from(osSite).where(or(ilike(osSite.name, like), ilike(osSite.id, like))).limit(5)) if (sc.inScope({ country: x.country })) res.push(['Chantier', x.name, `/os/dom/btp/${x.id}`]);
  if (canUse('dg fin dirreg rep chef', c)) for (const x of await db.select().from(invoice).where(or(ilike(invoice.number, like), sql`${invoice.buyer}->>'name' ilike ${like}`)).orderBy(desc(invoice.issuedAt)).limit(5)) if (sc.inScope({ country: x.country, domain: x.domain })) res.push(['Facture', `${x.number} · ${(x.buyer as { name?: string }).name ?? ''} · ${fcfa(x.totalXof)}`, '/os/tresorerie?t=fac']);
  if (c.me) for (const x of await db.select().from(osRequest).where(or(ilike(osRequest.id, like), ilike(osRequest.title, like))).orderBy(desc(osRequest.createdAt)).limit(10)) {
    if (x.byStaff !== c.me.id && !(canUse(MANAGERS, c) && sc.inScope({ country: x.country, domain: x.domain }))) continue;
    res.push([RTYPE[x.type as ReqType] ?? x.type, `${x.id} · ${x.title} · ${x.status}`, x.byStaff === c.me.id ? '/os/moi' : '/os/approbations']);
  }
  if (canUse('dg dirreg rep agent conf com', c)) for (const x of await db.select().from(osInscription).where(or(ilike(osInscription.id, like), ilike(osInscription.name, like), ilike(osInscription.company, like))).limit(5)) if (sc.inScope({ country: x.country, domain: x.domains })) res.push(['Inscription', `${x.id} · ${x.name} · ${x.status}`, '/os/inscriptions']);
  return json({ ok: true, results: res.slice(0, 30) });
};
