/* CEA OS — actions des pages « Domaines d'intervention » (prototype), gardées par le profil du domaine (src/lib/os/domaines.ts).
   POST JSON ou multipart { action, … } :
   kap.status { id, status } · aca.decide { id, status } · tal.verify { id } · tal.sample
   evt.budget { eventId, budget, sponsors, sponsorship } · evt.checkin { code }
   prj.create { name, country, funder, budget, milestones, next? } · prj.update { id, progress, spent, health } · prj.milestone { id, i, done }
   act.create { name, country, valuation, share } · act.stage { id, stage } · act.transfer { id }
   mm.remind { circleId }
   btp.site { name, client, country, amount } · btp.lot { lotId, progress?, cost? } · btp.log { siteId, weather, workforce, text, file? }
   btp.statement { siteId } · btp.sub { siteId, name, lot, amount } · btp.subpay { subId } · btp.hse { siteId, gravity, text } · btp.hseclose { id }
   btp.tender { object, client, country, amount, deadline, probability } · btp.tenderstatus { id, status } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { dossier, dossierEvent } from '../../../../db/schema/kapital';
import { programmeApplication, hireDeclaration, eventTicket, circleMember, payment } from '../../../../db/schema/app';
import { osEventFin, osProject, osCapital, osTask, osSite, osSiteLot, osSiteLog, osSiteStatement, osSiteSub, osSiteHse, osTender } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, scopeState } from '../../../../lib/os/core';
import { notifyStaff, createRequest, circuit, engageBudget } from '../../../../lib/os/approvals';
import { notify } from '../../../../lib/notify';
import { statusLabel } from '../../../../lib/kapital';
import { message } from '../../../../lib/templates';
import { issue } from '../../../../lib/invoices';
import { storeFile } from '../../../../lib/storage';
import { domSpec, marge, DEFAULT_LOTS, KAP_STEPS, ACT_STAGES, TENDER_ST } from '../../../../lib/os/domaines';
import { PK, fcfa, type Dom } from '../../../../lib/os/ref';

export const prerender = false;

const Country = z.enum(PK as [string, ...string[]]);
const Money = z.coerce.number().int().min(0).max(1e13);
const Uuid = z.uuid();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('kap.status'), id: Uuid, status: z.enum(KAP_STEPS) }),
  z.object({ action: z.literal('aca.decide'), id: Uuid, status: z.enum(['en_evaluation', 'admise', 'liste_attente', 'refusee']) }),
  z.object({ action: z.literal('tal.verify'), id: Uuid }),
  z.object({ action: z.literal('tal.sample') }),
  z.object({ action: z.literal('evt.budget'), eventId: z.string().max(40), budget: Money, sponsors: z.coerce.number().int().min(0).max(1000), sponsorship: Money }),
  z.object({ action: z.literal('evt.checkin'), code: z.string().trim().min(4).max(80) }),
  z.object({ action: z.literal('prj.create'), name: z.string().trim().min(3).max(200), country: Country, funder: z.string().trim().max(200).default(''), budget: Money, milestones: z.string().max(2000).default(''), next: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default('') }),
  z.object({ action: z.literal('prj.update'), id: Uuid, progress: z.coerce.number().int().min(0).max(100), spent: Money, health: z.enum(['ok', 'warn', 'bad']) }),
  z.object({ action: z.literal('prj.milestone'), id: Uuid, i: z.coerce.number().int().min(0).max(50), done: z.boolean() }),
  z.object({ action: z.literal('act.create'), name: z.string().trim().min(2).max(160), country: Country, valuation: Money, share: z.coerce.number().int().min(0).max(100) }),
  z.object({ action: z.literal('act.stage'), id: Uuid, stage: z.enum(ACT_STAGES) }),
  z.object({ action: z.literal('act.transfer'), id: Uuid }),
  z.object({ action: z.literal('mm.remind'), circleId: Uuid }),
  z.object({ action: z.literal('btp.site'), name: z.string().trim().min(3).max(200), client: z.string().trim().max(200).default(''), country: Country, amount: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('btp.lot'), lotId: Uuid, progress: z.coerce.number().int().min(0).max(100).optional(), cost: Money.optional() }),
  z.object({ action: z.literal('btp.log'), siteId: z.string().max(20), weather: z.string().max(60), workforce: z.coerce.number().int().min(0).max(10000), text: z.string().trim().min(3, 'Décrivez les travaux de la journée.').max(4000) }),
  z.object({ action: z.literal('btp.statement'), siteId: z.string().max(20) }),
  z.object({ action: z.literal('btp.sub'), siteId: z.string().max(20), name: z.string().trim().min(2).max(160), lot: z.string().trim().min(2).max(120), amount: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('btp.subpay'), subId: Uuid }),
  z.object({ action: z.literal('btp.hse'), siteId: z.string().max(20), gravity: z.enum(['Presque-accident', 'Accident sans arrêt', 'Accident avec arrêt']), text: z.string().trim().min(3, 'Décrivez l’incident.').max(2000) }),
  z.object({ action: z.literal('btp.hseclose'), id: Uuid }),
  z.object({ action: z.literal('btp.tender'), object: z.string().trim().min(3).max(200), client: z.string().trim().max(200).default(''), country: Country, amount: Money, deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), probability: z.coerce.number().int().min(0).max(100) }),
  z.object({ action: z.literal('btp.tenderstatus'), id: z.string().max(20), status: z.enum(TENDER_ST) }),
]);
const DOM_OF: Record<string, Dom> = { kap: 'kap', aca: 'aca', tal: 'tal', evt: 'evt', prj: 'prj', act: 'act', mm: 'mm', btp: 'btp' };

async function newSite(name: string, client: string, country: string, amount: number, manager: string | null) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osSite);
  const id = `CH-${201 + n}`;
  await db.insert(osSite).values({ id, name, client, country, amount, manager, end: new Date(Date.now() + 365 * 864e5) });
  await db.insert(osSiteLot).values(DEFAULT_LOTS.map(([l, f], i) => ({ siteId: id, name: l, budget: Math.round(amount * f * 0.85), position: i })));
  return id;
}

export const POST: APIRoute = async ({ locals, request, cookies }) => {
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData().catch(() => null) : null;
  const raw = form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) : await request.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const d = DOM_OF[b.action.split('.')[0]];
  const c = await osApi(locals.user, domSpec(d));
  if (c instanceof Response) return c;
  const actor = locals.user!.id, me = c.me;
  const people = await allStaff();
  const sc = scopeState(c, cookies);
  const ok = (message: string, extra: Record<string, unknown> = {}) => json({ ok: true, message, ...extra });

  switch (b.action) {
    case 'kap.status': {
      const [x] = await db.select().from(dossier).where(eq(dossier.id, b.id));
      if (!x || !sc.inScope({ country: x.country })) return fail('Dossier introuvable.', 404);
      if (b.status === x.status) return ok('Étape inchangée.');
      await db.update(dossier).set({ status: b.status, updatedAt: new Date() }).where(eq(dossier.id, x.id));
      await db.insert(dossierEvent).values({ dossierId: x.id, fromStatus: x.status, toStatus: b.status, actorId: actor });
      await notify(x.ownerId, `Dossier ${x.reference} : ${statusLabel(b.status)}`, '/kapital/entreprise', { email: true });
      await audit(actor, 'kapital.dossier.statut', x.reference, { from: x.status, to: b.status });
      return ok(`${x.companyName} : étape « ${statusLabel(b.status)} ». Entreprise notifiée.`);
    }
    case 'aca.decide': {
      const [a] = await db.select().from(programmeApplication).where(eq(programmeApplication.id, b.id));
      if (!a) return fail('Candidature introuvable.', 404);
      await db.update(programmeApplication).set({ status: b.status, updatedAt: new Date() }).where(eq(programmeApplication.id, a.id));
      if (b.status !== a.status) await notify(a.userId, await message(`candidature.${b.status}`, { reference: a.reference }), '/espace/candidatures', { email: true, whatsapp: b.status === 'admise' });
      await audit(actor, 'admin.candidature.statut', a.reference, { from: a.status, to: b.status });
      return ok('Décision enregistrée ; le candidat est notifié.');
    }
    case 'tal.verify': {
      await db.update(hireDeclaration).set({ verified6mAt: new Date() }).where(eq(hireDeclaration.id, b.id));
      await audit(actor, 'impact.embauche.verification', b.id, { months: 6 });
      return ok('Emploi vérifié.');
    }
    case 'tal.sample': {
      const six = new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10);
      const pool = await db.select().from(hireDeclaration).where(and(isNull(hireDeclaration.verified6mAt), lt(hireDeclaration.hiredOn, six)));
      const pickd = pool.sort(() => Math.random() - 0.5).slice(0, 3);
      for (const h of pickd) await notify(h.employerId, `Contrôle par échantillon : merci de transmettre la preuve de l'emploi de ${h.personName} (contrat ou déclaration sociale).`, '/espace/recruteur', { email: true });
      await audit(actor, 'impact.embauche.echantillon', `${pickd.length}`);
      return ok(`${pickd.length} emploi(s) tiré(s) au sort : demande de preuve envoyée aux employeurs.`);
    }
    case 'evt.budget': {
      await db.insert(osEventFin).values({ eventId: b.eventId, budget: b.budget, sponsors: b.sponsors, sponsorship: b.sponsorship }).onConflictDoUpdate({ target: osEventFin.eventId, set: { budget: b.budget, sponsors: b.sponsors, sponsorship: b.sponsorship } });
      await audit(actor, 'os.evenement.budget', b.eventId, { budget: b.budget });
      return ok('Budget de l’événement enregistré.');
    }
    case 'evt.checkin': {
      const [t] = await db.select().from(eventTicket).where(eq(eventTicket.code, b.code.toUpperCase()));
      if (!t || t.status !== 'valide') return fail('Billet invalide.');
      if (t.checkedInAt) return fail(`Billet déjà utilisé (${t.checkedInAt.toLocaleTimeString('fr-FR')}).`);
      await db.update(eventTicket).set({ checkedInAt: new Date() }).where(eq(eventTicket.id, t.id));
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(eventTicket).where(and(eq(eventTicket.eventId, t.eventId), sql`${eventTicket.checkedInAt} is not null`));
      await audit(actor, 'evenement.controle', t.code);
      return ok(`Entrée validée — ${n} présent(s).`);
    }
    case 'prj.create': {
      const ms = b.milestones.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => [x, false] as [string, boolean]);
      await db.insert(osProject).values({ name: b.name, country: b.country, funder: b.funder, budget: b.budget, milestones: ms, next: b.next ? new Date(b.next) : null, owner: me?.id ?? null });
      await audit(actor, 'os.projet.creation', b.name);
      return ok('Projet ajouté au portefeuille.');
    }
    case 'prj.update': {
      const [x] = await db.update(osProject).set({ progress: b.progress, spent: b.spent, health: b.health }).where(eq(osProject.id, b.id)).returning();
      if (!x) return fail('Projet introuvable.', 404);
      await audit(actor, 'os.projet.suivi', x.name, { avancement: b.progress, sante: b.health });
      return ok('Projet mis à jour.');
    }
    case 'prj.milestone': {
      const [x] = await db.select().from(osProject).where(eq(osProject.id, b.id));
      if (!x || !x.milestones[b.i]) return fail('Jalon introuvable.', 404);
      const ms = x.milestones.map((m, i) => (i === b.i ? [m[0], b.done] as [string, boolean] : m));
      await db.update(osProject).set({ milestones: ms }).where(eq(osProject.id, x.id));
      return ok(b.done ? 'Jalon atteint.' : 'Jalon rouvert.');
    }
    case 'act.create': {
      await db.insert(osCapital).values({ name: b.name, country: b.country, valuation: b.valuation, share: b.share });
      await audit(actor, 'os.actionnariat.creation', b.name);
      return ok('PME ajoutée.');
    }
    case 'act.stage': {
      const [x] = await db.update(osCapital).set({ stage: b.stage }).where(eq(osCapital.id, b.id)).returning();
      if (!x) return fail('PME introuvable.', 404);
      await audit(actor, 'os.actionnariat.etape', x.name, { etape: b.stage });
      return ok(`${x.name} : ${b.stage}.`);
    }
    case 'act.transfer': {
      const [x] = await db.update(osCapital).set({ stage: 'Transférée à Kapital' }).where(eq(osCapital.id, b.id)).returning();
      if (!x) return fail('PME introuvable.', 404);
      const chef = people.find((s) => s.prof === 'chef' && s.domain === 'kap' && s.active) ?? people.find((s) => s.prof === 'dg');
      if (chef) {
        await db.insert(osTask).values({ title: `Ouvrir le dossier de levée de fonds de ${x.name} (${fcfa((x.valuation * x.share) / 100)} recherchés)`, owner: chef.id, country: x.country, domain: 'kap', due: new Date(Date.now() + 7 * 864e5), createdBy: me?.id ?? null });
        await notifyStaff([chef.id], `PME transférée par CEA Actionnariat : ${x.name}`, '/os/taches', people);
      }
      await audit(actor, 'os.actionnariat.transfert', x.name);
      return ok(`${x.name} transférée à CEA Kapital Invest : tâche créée pour l’équipe Kapital.`);
    }
    case 'mm.remind': {
      const members = await db.select({ u: circleMember.userId }).from(circleMember).where(eq(circleMember.circleId, b.circleId));
      const paid = members.length ? new Set((await db.select({ u: payment.userId }).from(payment).where(and(eq(payment.purpose, 'mastermind'), eq(payment.status, 'reussi'), inArray(payment.userId, members.map((m) => m.u)), sql`${payment.paidAt} > now() - interval '1 year'`))).map((x) => x.u)) : new Set();
      const late = members.filter((m) => !paid.has(m.u));
      for (const m of late) await notify(m.u, 'Rappel : votre cotisation au cercle Mastermind est à renouveler.', '/communaute/mastermind', { whatsapp: true });
      await audit(actor, 'os.mastermind.relance', b.circleId, { relances: late.length });
      return ok(`${late.length} relance(s) envoyée(s) par WhatsApp.`);
    }
    case 'btp.site': {
      const id = await newSite(b.name, b.client, b.country, b.amount, me?.id ?? null);
      await audit(actor, 'os.btp.chantier', id);
      return ok('Chantier créé avec un budget type par lot (marge cible 15 %).', { redirect: `/os/dom/btp/${id}` });
    }
    case 'btp.lot': {
      const [l] = await db.select().from(osSiteLot).where(eq(osSiteLot.id, b.lotId));
      if (!l) return fail('Lot introuvable.', 404);
      const progress = b.progress ?? l.progress, cost = b.cost ?? l.cost;
      await db.update(osSiteLot).set({ progress, cost }).where(eq(osSiteLot.id, l.id));
      let alert = false;
      if (progress > 0 && cost > ((l.budget * progress) / 100) * 1.05) {
        alert = true;
        const chef = people.find((s) => s.prof === 'chef' && s.domain === 'btp' && s.active) ?? me;
        if (chef) {
          await db.insert(osTask).values({ title: `Plan d'action — dépassement sur ${l.name} (${l.siteId})`, owner: chef.id, domain: 'btp', due: new Date(Date.now() + 5 * 864e5), createdBy: me?.id ?? null });
          await notifyStaff([chef.id], `Dépassement de plus de 5 % sur ${l.name} (${l.siteId})`, `/os/dom/btp/${l.siteId}`, people);
        }
      }
      await audit(actor, 'os.btp.lot', l.siteId, { lot: l.name, avancement: progress, cout: cost });
      return ok(alert ? 'Dépassement > 5 % : alerte envoyée et tâche de plan d’action créée.' : 'Lot mis à jour.');
    }
    case 'btp.log': {
      const file = form?.get('file');
      let photo: { key: string; name: string } | undefined;
      if (file instanceof File && file.size) { try { const s = await storeFile(file, `os/chantiers/${b.siteId}`); photo = { key: s.key, name: file.name.slice(0, 160) }; } catch (e) { return fail(e instanceof Error ? e.message : 'Photo refusée.'); } }
      await db.insert(osSiteLog).values({ siteId: b.siteId, weather: b.weather, workforce: b.workforce, text: b.text, photo, by: me?.id ?? null });
      await audit(actor, 'os.btp.journal', b.siteId);
      return ok('Journée enregistrée.');
    }
    case 'btp.statement': {
      const [s] = await db.select().from(osSite).where(eq(osSite.id, b.siteId));
      if (!s) return fail('Chantier introuvable.', 404);
      const [lots, sits] = await Promise.all([db.select().from(osSiteLot).where(eq(osSiteLot.siteId, s.id)), db.select().from(osSiteStatement).where(eq(osSiteStatement.siteId, s.id)).orderBy(asc(osSiteStatement.no))]);
      const pcNow = Math.round(marge(s.amount, lots).av), pcCum = sits.at(-1)?.progress ?? 0;
      if (pcNow <= pcCum) return fail(`Aucun avancement nouveau depuis la dernière situation (${pcCum} %).`);
      const amount = Math.round((s.amount * (pcNow - pcCum)) / 100), ret = Math.round((amount * s.retention) / 100);
      const inv = await issue({ kind: 'facture', buyer: { name: s.client || s.name }, purpose: 'autre', lines: [{ label: `Situation de travaux n°${sits.length + 1} — ${s.name}`, qty: 1, unitXof: amount - ret }], totalHtXof: amount - ret, taxRate: 0, taxXof: 0, totalXof: amount - ret, status: 'a_payer', dueOn: new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10), issuedBy: actor, country: s.country, domain: 'btp' });
      await db.insert(osSiteStatement).values({ siteId: s.id, no: sits.length + 1, progress: pcNow, amount, invoiceNumber: inv.number });
      await audit(actor, 'os.btp.situation', s.id, { no: sits.length + 1, montant: amount });
      return ok(`Situation n°${sits.length + 1} établie ; facture ${inv.number} créée en finance.`);
    }
    case 'btp.sub': {
      await db.insert(osSiteSub).values({ siteId: b.siteId, name: b.name, lot: b.lot, amount: b.amount });
      return ok('Sous-traitant ajouté.');
    }
    case 'btp.subpay': {
      if (!me) return fail('Une fiche personnel est nécessaire pour demander un paiement.', 403);
      const [x] = await db.select().from(osSiteSub).where(eq(osSiteSub.id, b.subId));
      const [s] = x ? await db.select().from(osSite).where(eq(osSite.id, x.siteId)) : [];
      if (!x || !s) return fail('Sous-traitant introuvable.', 404);
      const amt = Math.round((x.amount - x.paid) * 0.3);
      if (amt <= 0) return fail('Contrat déjà soldé.');
      const r = await createRequest(me, 'dep', { title: `Sous-traitance ${x.lot} — ${x.name} (${s.name})`, amount: amt, country: s.country, domain: 'btp' });
      await engageBudget('btp', amt);
      await db.update(osSiteSub).set({ paid: x.paid + amt }).where(eq(osSiteSub.id, x.id));
      return ok(`Demande de paiement ${r.id} (${fcfa(amt)}) soumise : ${circuit(r.steps)}.`);
    }
    case 'btp.hse': {
      const [s] = await db.select().from(osSite).where(eq(osSite.id, b.siteId));
      if (!s) return fail('Chantier introuvable.', 404);
      await db.insert(osSiteHse).values({ siteId: s.id, text: `${b.gravity} — ${b.text}` });
      await notifyStaff(people.filter((x) => x.active && ((x.domain === 'btp' && ['chef', 'cond'].includes(x.prof)) || x.prof === 'dg')).map((x) => x.id), `Incident HSE déclaré : ${s.name}`, `/os/dom/btp/${s.id}?t=hse`, people);
      await audit(actor, 'os.btp.hse', s.id, { gravite: b.gravity });
      return ok('Incident déclaré : responsable QHSE, chef de département et Direction générale notifiés.');
    }
    case 'btp.hseclose': {
      await db.update(osSiteHse).set({ status: 'Clôturé' }).where(eq(osSiteHse.id, b.id));
      return ok('Incident clôturé.');
    }
    case 'btp.tender': {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osTender);
      await db.insert(osTender).values({ id: `AO-${String(new Date().getFullYear()).slice(2)}-${String(31 + n).padStart(3, '0')}`, object: b.object, client: b.client, country: b.country, amount: b.amount, deadline: new Date(b.deadline), probability: b.probability });
      return ok('Appel d’offres ajouté à la veille.');
    }
    case 'btp.tenderstatus': {
      const [t] = await db.update(osTender).set({ status: b.status }).where(eq(osTender.id, b.id)).returning();
      if (!t) return fail('Appel d’offres introuvable.', 404);
      await audit(actor, 'os.btp.appel_offres', t.id, { decision: b.status });
      if (b.status === 'Gagné') { const id = await newSite(t.object, t.client, t.country, t.amount, null); return ok('Marché gagné : chantier créé automatiquement avec budget par lot.', { redirect: `/os/dom/btp/${id}` }); }
      return ok(`Décision enregistrée : ${b.status}.`);
    }
  }
  return fail('Action inconnue.');
};
