/* CEA OS — pilotage (prototype : OKR, Risques et audit, Mon équipe, Organisation et postes, Processus).
   POST { action, … } :
   okr.create { title, level, parentId?, owner } · okr.progress { id, progress }
   risk.create { title, domain, probability, impact, owner, plan } · risk.status { id, status } · audit.create { title }
   review.decide { staffId, ok } · review.apply · review.lift · review.new
   interview.save { staffId, competences[], objectives }
   flow.toggle { id } · flow.steps { id, steps (une étape par ligne) }
   country.open { code, name, region, currency } · poste.assign { staffId, code, mode: main | cumul } */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osOkr, osRisk, osAudit, osReview, osReviewItem, osInterview, osFlow, osCountry, osChannel, staff } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, canUse, loadCountries, MANAGERS } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { closeSessions } from '../../../../lib/members';
import { allOkrs, currentReview, quarterOf, COMPS } from '../../../../lib/os/pilotage';
import { kpisOf } from '../../../../lib/os/kpis';
import { DK, PAYS, REGIONS, REF, SOD, PDOM, DOM, profOf, refT, gradeOf, regOf, PROF } from '../../../../lib/os/ref';

export const prerender = false;

const Emp = z.string().regex(/^EMP\d{3,6}$/);
const Id = z.uuid();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('okr.create'), title: z.string().trim().min(3, 'Rédigez l’objectif.').max(300), level: z.enum(['Organisation', 'Département', 'Région', 'Pays', 'Fonction', 'Équipe']), parentId: z.preprocess((v) => (v === '' ? undefined : v), Id.optional()), owner: Emp }),
  z.object({ action: z.literal('okr.progress'), id: Id, progress: z.coerce.number().int().min(0).max(100) }),
  z.object({ action: z.literal('risk.create'), title: z.string().trim().min(3, 'Décrivez le risque.').max(300), domain: z.enum(DK as [string, ...string[]]), probability: z.coerce.number().int().min(1).max(5), impact: z.coerce.number().int().min(1).max(5), owner: Emp, plan: z.string().trim().max(500).default('') }),
  z.object({ action: z.literal('risk.status'), id: Id, status: z.enum(['Ouvert', 'En traitement', 'Maîtrisé', 'Clos']) }),
  z.object({ action: z.literal('audit.create'), title: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal('review.decide'), staffId: Emp, ok: z.preprocess((v) => (v === 'false' ? false : v === 'true' ? true : v), z.boolean()) }),
  z.object({ action: z.literal('review.apply') }), z.object({ action: z.literal('review.lift') }), z.object({ action: z.literal('review.new') }),
  z.object({ action: z.literal('interview.save'), staffId: Emp, competences: z.array(z.coerce.number().int().min(1).max(4)).length(COMPS.length), objectives: z.string().trim().max(4000).default('') }),
  z.object({ action: z.literal('flow.toggle'), id: Id }),
  z.object({ action: z.literal('flow.steps'), id: Id, steps: z.string().max(4000) }),
  z.object({ action: z.literal('country.open'), code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Code ISO à 2 lettres.'), name: z.string().trim().min(2, 'Nom du pays requis.').max(80), region: z.enum(Object.keys(REGIONS) as [string, ...string[]]), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('XOF') }),
  z.object({ action: z.literal('poste.assign'), staffId: Emp, code: z.string().refine((c) => REF.some((r) => r.c === c), 'Poste inconnu.'), mode: z.enum(['main', 'cumul']) }),
]);

const SPEC: Record<string, string | undefined> = {
  'risk.create': 'dg ops conf jur chef dirreg', 'risk.status': 'dg ops conf jur chef dirreg', 'audit.create': 'dg ops conf jur chef dirreg',
  'review.apply': 'dg it conf', 'review.lift': 'dg it conf', 'review.new': 'dg it conf', 'flow.toggle': 'dg ops it conf', 'flow.steps': 'dg ops it conf',
  'country.open': 'dg rh', 'poste.assign': 'dg rh',
};

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const c = await osApi(locals.user, SPEC[b.action]);
  if (c instanceof Response) return c;
  const me = c.me, actor = locals.user!.id;
  const people = await allStaff();
  const person = (id: string) => people.find((s) => s.id === id);

  switch (b.action) {
    case 'okr.create': {
      if (!b.parentId && me?.prof !== 'dg' && !c.superuser) return fail('Seule la Direction générale fixe les objectifs de l’organisation.', 403);
      if (b.parentId && !canUse(MANAGERS, c)) return fail('Votre profil ne permet pas de décliner un objectif.', 403);
      if (b.parentId && !(await db.select({ id: osOkr.id }).from(osOkr).where(eq(osOkr.id, b.parentId))).length) return fail('Objectif parent introuvable.', 404);
      if (!person(b.owner)) return fail('Responsable introuvable.');
      await db.insert(osOkr).values({ title: b.title, level: b.parentId ? b.level : 'Organisation', parentId: b.parentId ?? null, owner: b.owner });
      await notifyStaff([b.owner], `Objectif confié : ${b.title}`, '/admin/okr', people);
      await audit(actor, 'os.okr.creation', b.title);
      return json({ ok: true, message: 'Objectif créé.' });
    }
    case 'okr.progress': {
      const all = await allOkrs();
      const o = all.find((x) => x.id === b.id);
      if (!o) return fail('Objectif introuvable.', 404);
      if (all.some((x) => x.parentId === o.id)) return fail('L’avancement d’un objectif décliné est calculé à partir de ses enfants.');
      if (o.owner !== me?.id && me?.prof !== 'dg' && !c.superuser) return fail('Seul le responsable de l’objectif met à jour son avancement.', 403);
      await db.update(osOkr).set({ progress: b.progress }).where(eq(osOkr.id, o.id));
      await audit(actor, 'os.okr.avancement', o.title, { avancement: b.progress });
      return json({ ok: true, message: `Avancement : ${b.progress} %.` });
    }
    case 'risk.create': {
      await db.insert(osRisk).values({ title: b.title, domain: b.domain, probability: b.probability, impact: b.impact, owner: b.owner, plan: b.plan, country: me?.country ?? 'TG' });
      await notifyStaff([b.owner], `Vous êtes responsable du risque : ${b.title}`, '/admin/risques', people);
      await audit(actor, 'os.risque.creation', b.title);
      return json({ ok: true, message: 'Risque enregistré.' });
    }
    case 'risk.status': {
      const [r] = await db.update(osRisk).set({ status: b.status }).where(eq(osRisk.id, b.id)).returning();
      if (!r) return fail('Risque introuvable.', 404);
      await audit(actor, 'os.risque.statut', r.title, { statut: b.status });
      return json({ ok: true, message: `Risque : ${b.status}.` });
    }
    case 'audit.create': {
      await db.insert(osAudit).values({ title: b.title });
      await audit(actor, 'os.audit.creation', b.title);
      return json({ ok: true, message: 'Mission d’audit créée.' });
    }
    case 'review.decide': {
      const s = person(b.staffId);
      if (!s) return fail('Collaborateur introuvable.', 404);
      if (s.managerId !== me?.id && !['dg', 'rh'].includes(c.prof ?? '') && !c.superuser) return fail('Seul le responsable confirme les accès de son équipe.', 403);
      const r = await currentReview();
      await db.insert(osReviewItem).values({ quarter: r.quarter, staffId: s.id, decision: b.ok ? 'ok' : 'ko', by: me?.id ?? null }).onConflictDoUpdate({ target: [osReviewItem.quarter, osReviewItem.staffId], set: { decision: b.ok ? 'ok' : 'ko', at: new Date() } });
      if (!b.ok) { await db.update(staff).set({ suspended: true, updatedAt: new Date() }).where(eq(staff.id, s.id)); if (s.userId) await closeSessions(s.userId); }
      await audit(actor, b.ok ? 'os.revue.confirmation' : 'os.revue.retrait', s.id);
      return json({ ok: true, message: b.ok ? 'Accès confirmés.' : 'Accès retirés : compte suspendu.' });
    }
    case 'review.apply': {
      const r = await currentReview();
      const done = new Set((await db.select({ s: osReviewItem.staffId }).from(osReviewItem).where(eq(osReviewItem.quarter, r.quarter))).map((x) => x.s));
      const targets = people.filter((s) => s.active && !done.has(s.id) && s.prof !== 'dg' && s.id !== me?.id);
      if (targets.length) {
        await db.update(staff).set({ suspended: true, updatedAt: new Date() }).where(inArray(staff.id, targets.map((s) => s.id)));
        for (const s of targets) if (s.userId) await closeSessions(s.userId);
      }
      await db.update(osReview).set({ applied: true }).where(eq(osReview.quarter, r.quarter));
      await audit(actor, 'os.revue.echeance', r.quarter, { suspendus: targets.length });
      return json({ ok: true, message: `${targets.length} compte(s) suspendu(s).` });
    }
    case 'review.lift': {
      await db.update(staff).set({ suspended: false, updatedAt: new Date() }).where(eq(staff.suspended, true));
      await audit(actor, 'os.revue.levee', 'suspensions');
      return json({ ok: true, message: 'Suspensions levées.' });
    }
    case 'review.new': {
      const q = quarterOf();
      const [exists] = await db.select().from(osReview).where(eq(osReview.quarter, q));
      if (exists) await db.update(osReview).set({ start: new Date(), applied: false }).where(eq(osReview.quarter, q));
      else await db.insert(osReview).values({ quarter: q });
      await db.delete(osReviewItem).where(eq(osReviewItem.quarter, q));
      const managers = people.filter((s) => s.active && people.some((x) => x.managerId === s.id)).map((s) => s.id);
      await notifyStaff(managers, 'Revue des droits lancée : confirmez les accès de votre équipe', '/admin/equipe', people);
      await audit(actor, 'os.revue.lancement', q);
      return json({ ok: true, message: `Revue ${q} lancée : ${managers.length} responsable(s) notifié(s).` });
    }
    case 'interview.save': {
      const s = person(b.staffId);
      if (!s) return fail('Collaborateur introuvable.', 404);
      if (s.managerId !== me?.id && !['dg', 'rh'].includes(c.prof ?? '')) return fail('Seul le responsable conduit l’entretien annuel.', 403);
      const ks = await kpisOf(s, people);
      await db.insert(osInterview).values({ staffId: s.id, managerId: me?.id ?? null, competences: b.competences, objectives: b.objectives, kpis: ks.map((k) => [k.l, String(k.v)]) });
      await notifyStaff([s.id], `Votre entretien annuel a été enregistré par ${me?.name ?? 'votre responsable'}`, '/admin/poste', people);
      await audit(actor, 'os.entretien_annuel', s.id);
      return json({ ok: true, message: 'Entretien enregistré ; le collaborateur est notifié.' });
    }
    case 'flow.toggle': {
      const [f] = await db.update(osFlow).set({ active: sql`not ${osFlow.active}` }).where(eq(osFlow.id, b.id)).returning();
      if (!f) return fail('Processus introuvable.', 404);
      await audit(actor, f.active ? 'os.processus.activation' : 'os.processus.desactivation', f.name);
      return json({ ok: true, message: f.active ? 'Processus activé.' : 'Processus désactivé.' });
    }
    case 'flow.steps': {
      const steps = b.steps.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20);
      if (steps.length < 2) return fail('Au moins 2 étapes.');
      const [f] = await db.update(osFlow).set({ steps, version: sql`${osFlow.version} + 1` }).where(eq(osFlow.id, b.id)).returning();
      if (!f) return fail('Processus introuvable.', 404);
      await audit(actor, 'os.processus.modification', f.name, { version: f.version });
      return json({ ok: true, message: `Nouvelle version enregistrée (v${f.version}).` });
    }
    case 'country.open': {
      await loadCountries(true);
      if (PAYS[b.code]) return fail('Ce pays existe déjà.');
      await db.insert(osCountry).values({ code: b.code, name: b.name, region: b.region, currency: b.currency });
      await db.insert(osChannel).values({ id: 'pays_' + b.code, name: 'Bureau ' + b.name, scope: 'pays:' + b.code }).onConflictDoNothing();
      await loadCountries(true);
      await audit(actor, 'os.pays.ouverture', b.code, { nom: b.name, region: b.region });
      return json({ ok: true, message: `Bureau ${b.name} ouvert : canal de messagerie créé ; le poste de représentant (B2) est à pourvoir.` });
    }
    case 'poste.assign': {
      const s = person(b.staffId);
      if (!s || !s.active) return fail('Collaborateur introuvable.', 404);
      const other = b.mode === 'cumul' ? s.poste : s.poste2;
      const bad = SOD.find((x) => (x[0] === b.code && x[1] === other) || (x[1] === b.code && x[0] === other));
      if (bad) return fail(`Cumul interdit (séparation des tâches) : ${bad[2]}.`);
      if (b.mode === 'main') {
        const dom = PDOM[b.code] ?? null;
        await db.update(staff).set({ poste: b.code, domain: dom, grade: gradeOf(b.code), department: dom ? DOM[dom].n : s.department, updatedAt: new Date() }).where(eq(staff.id, s.id));
        await audit(actor, 'os.poste.changement', s.id, { de: s.poste, vers: b.code, profil: PROF[profOf(b.code)], region: regOf(s.country) });
      } else {
        await db.update(staff).set({ poste2: b.code, updatedAt: new Date() }).where(eq(staff.id, s.id));
        await audit(actor, 'os.poste.cumul', s.id, { cumul: b.code });
      }
      await notifyStaff([s.id], `Votre affectation a changé : ${refT(b.code)}`, '/admin/poste', people);
      return json({ ok: true, message: 'Affectation enregistrée ; les droits sont mis à jour.' });
    }
  }
  return fail('Action inconnue.');
};
