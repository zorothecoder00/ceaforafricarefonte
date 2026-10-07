/* CEA OS — ressources humaines (prototype : Ressources humaines › Paie, Recrutement, Mon équipe › Demander un recrutement).
   POST JSON { action, … } ou multipart (candidature avec CV) :
   payroll.run { month } (dg, rh) · payroll.rates { currency, cs, cp, imp } (dg, rh)
   recruit.request { poste, country, salary, why } (managers) · recruit.publish { id } · recruit.close { id } (dg, rh)
   candidate.add { recruitId, name, email, source, file? } · candidate.score { id, exp, tech, ent, integ, coop, lang, coi } (dg, rh)
   candidate.offer { id, salary } (dg, rh) → embauche immédiate dans la fourchette du grade, sinon approbation de la DG */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osPayroll, osRecruit, osCandidate } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, canUse, MANAGERS } from '../../../../lib/os/core';
import { createRequest, circuit } from '../../../../lib/os/approvals';
import { getSetting, setSetting } from '../../../../lib/settings';
import { storeFile } from '../../../../lib/storage';
import { runPayroll, WEIGHTS, scoreOf, eligible, recruitLevel, hire } from '../../../../lib/os/rh';
import { BANDS, PK, REF, gradeOf, pn, refT, fcfa } from '../../../../lib/os/ref';

export const prerender = false;

const Score = z.coerce.number().int().min(1).max(4);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('payroll.run'), month: z.string().regex(/^\d{4}-\d{2}$/, 'Mois invalide.') }),
  z.object({ action: z.literal('payroll.rates'), currency: z.string().regex(/^[A-Z]{3}$/), cs: z.coerce.number().min(0).max(100), cp: z.coerce.number().min(0).max(100), imp: z.coerce.number().min(0).max(100) }),
  z.object({ action: z.literal('recruit.request'), poste: z.string().refine((c) => REF.some((r) => r.c === c), 'Poste inconnu.'), country: z.enum(PK as [string, ...string[]]), salary: z.coerce.number().int().min(0).max(1e9), why: z.string().trim().min(5, 'Justifiez la demande.').max(2000) }),
  z.object({ action: z.literal('recruit.publish'), id: z.string().max(20) }),
  z.object({ action: z.literal('recruit.close'), id: z.string().max(20) }),
  z.object({ action: z.literal('candidate.add'), recruitId: z.string().max(20), name: z.string().trim().min(3, 'Indiquez le nom.').max(120), email: z.email('E-mail invalide.').max(160), source: z.enum(['Candidature spontanée', 'Cabinet', 'Cooptation', 'Réseau CEA', 'Mobilité interne', 'Site web']).default('Candidature spontanée') }),
  z.object({ action: z.literal('candidate.score'), id: z.uuid(), exp: Score, tech: Score, ent: Score, integ: Score, coop: Score, lang: Score, coi: z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()) }),
  z.object({ action: z.literal('candidate.offer'), id: z.uuid(), salary: z.coerce.number().int().positive('Indiquez le salaire.') }),
]);
const RH = 'dg rh';

export const POST: APIRoute = async ({ locals, request, url }) => {
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData().catch(() => null) : null;
  const raw = form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) : await request.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const c = await osApi(locals.user, b.action === 'recruit.request' ? undefined : RH, b.action === 'recruit.request');
  if (c instanceof Response) return c;
  const actor = locals.user!.id;
  const people = await allStaff();

  switch (b.action) {
    case 'payroll.run': {
      const [done] = await db.select({ m: osPayroll.month }).from(osPayroll).where(eq(osPayroll.month, b.month));
      if (done) return fail('La paie de ce mois est déjà calculée.');
      const lines = await runPayroll(b.month, people, actor);
      await audit(actor, 'os.paie.validation', b.month, { bulletins: lines.length });
      return json({ ok: true, message: `Paie calculée : ${lines.length} bulletins publiés, écriture de paie générée.` });
    }
    case 'payroll.rates': {
      const cur = await getSetting('paie');
      await setSetting('paie', { rates: { ...cur.rates, [b.currency]: [b.cs / 100, b.cp / 100, b.imp / 100] } }, actor);
      await audit(actor, 'os.paie.taux', b.currency, { cs: b.cs, cp: b.cp, imp: b.imp });
      return json({ ok: true, message: `Taux ${b.currency} enregistrés.` });
    }
    case 'recruit.request': {
      if (!canUse(MANAGERS, c)) return fail('Votre profil ne permet pas de demander un recrutement.', 403);
      const me = c.me!;
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(osRecruit);
      const id = `REC-${21 + n}`;
      const g = gradeOf(b.poste);
      await db.insert(osRecruit).values({ id, poste: b.poste, country: b.country, byStaff: me.id, salary: b.salary || BANDS[g][0], why: b.why });
      const r = await createRequest(me, 'recrut', { title: `Recrutement ${b.poste} — ${refT(b.poste)} (${pn(b.country)})`, country: b.country, lvl: recruitLevel(b.poste), data: { rec: id } });
      await db.update(osRecruit).set({ requestId: r.id }).where(eq(osRecruit.id, id));
      return json({ ok: true, message: `Demande ${r.id} soumise : ${circuit(r.steps)}.` });
    }
    case 'recruit.publish': case 'recruit.close': {
      const [x] = await db.select().from(osRecruit).where(eq(osRecruit.id, b.id));
      if (!x) return fail('Recrutement introuvable.', 404);
      if (b.action === 'recruit.publish' && x.status !== 'Validée') return fail('Seul un recrutement validé peut être publié.');
      await db.update(osRecruit).set({ status: b.action === 'recruit.publish' ? 'Publiée' : 'Validée' }).where(eq(osRecruit.id, x.id));
      await audit(actor, b.action === 'recruit.publish' ? 'os.recrutement.publication' : 'os.recrutement.cloture', x.id);
      return json({ ok: true, message: b.action === 'recruit.publish' ? 'Annonce publiée : vous pouvez enregistrer les candidatures.' : 'Annonce clôturée.' });
    }
    case 'candidate.add': {
      const [x] = await db.select().from(osRecruit).where(eq(osRecruit.id, b.recruitId));
      if (!x || x.status !== 'Publiée') return fail('Publiez l’annonce pour enregistrer des candidatures.');
      const file = form?.get('file');
      let cv: { key: string; name: string } | undefined;
      if (file instanceof File && file.size) {
        try { const s = await storeFile(file, `os/cv/${x.id}`); cv = { key: s.key, name: file.name.slice(0, 160) }; } catch (e) { return fail(e instanceof Error ? e.message : 'CV refusé.'); }
      }
      await db.insert(osCandidate).values({ recruitId: x.id, name: b.name, email: b.email.toLowerCase(), source: b.source, cv });
      await audit(actor, 'os.recrutement.candidature', x.id, { candidat: b.name });
      return json({ ok: true, message: 'Candidature enregistrée.' });
    }
    case 'candidate.score': {
      if (!b.coi) return fail('Cochez la déclaration d’absence de conflit d’intérêts.');
      const sc = Object.fromEntries(WEIGHTS.map(([k]) => [k, b[k as 'exp']]));
      const [k] = await db.update(osCandidate).set({ scores: sc, status: 'Entretien', evaluator: actor }).where(eq(osCandidate.id, b.id)).returning();
      if (!k) return fail('Candidature introuvable.', 404);
      await audit(actor, 'os.recrutement.entretien', k.recruitId, { candidat: k.name, note: scoreOf(sc)?.toFixed(2) });
      return json({ ok: true, message: `Note pondérée : ${scoreOf(sc)!.toFixed(2)}/4 — ${eligible(sc) ? 'recrutable' : 'sous le seuil'}.` });
    }
    case 'candidate.offer': {
      const [k] = await db.select().from(osCandidate).where(eq(osCandidate.id, b.id));
      const [x] = k ? await db.select().from(osRecruit).where(eq(osRecruit.id, k.recruitId)) : [];
      if (!k || !x) return fail('Candidature introuvable.', 404);
      if (!eligible(k.scores)) return fail('Candidature sous le seuil : pas d’offre possible.');
      if (x.status === 'Pourvu') return fail('Ce poste est déjà pourvu.');
      const [lo, hi] = BANDS[gradeOf(x.poste)];
      if (b.salary >= lo && b.salary <= hi) {
        const h = await hire(x, k, b.salary, people, actor, url.origin);
        return json({ ok: true, message: `${h.name} embauché·e (${h.id}) : compte CEA OS créé, intégration de 90 jours lancée.` });
      }
      if (!c.me) return fail('Une fiche personnel est nécessaire pour soumettre une offre à la Direction générale.', 403);
      await db.update(osCandidate).set({ status: 'Offre en approbation' }).where(eq(osCandidate.id, k.id));
      const r = await createRequest(c.me, 'offre', { title: `Offre hors fourchette — ${k.name} (${x.poste}) à ${fcfa(b.salary)}`, amount: b.salary, country: x.country, data: { rec: x.id, cand: k.id } });
      return json({ ok: true, message: `Offre soumise à la Direction générale (${r.id}).` });
    }
  }
  return fail('Action inconnue.');
};
