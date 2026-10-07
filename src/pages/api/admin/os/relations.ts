/* CEA OS — relations (prototype : Membres et inscriptions, Réseau territorial).
   POST { action, … } :
   ins.validate { ids[] } · ins.reject { id, reason } · ins.info { id, message }  (dg, dirreg, rep, agent ; dans le périmètre)
   report.save { country, comment } · report.submit { country, comment } · report.reopen { country }  (représentant du pays, dg) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osInscription, osReport } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi } from '../../../../lib/os/guard';
import { allStaff, scopeState } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { decideInscriptions, askMore, reportPeriod, escalatedFor } from '../../../../lib/os/relations';
import { PK, pn, regOf } from '../../../../lib/os/ref';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ins.validate'), ids: z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : [v])) }),
  z.object({ action: z.literal('ins.reject'), id: z.string(), reason: z.enum(['Informations invérifiables', 'Entreprise hors périmètre', 'Doublon']) }),
  z.object({ action: z.literal('ins.info'), id: z.string(), message: z.string().trim().min(10, 'Rédigez le message.').max(1000) }),
  z.object({ action: z.literal('report.save'), country: z.enum(PK as [string, ...string[]]), comment: z.string().max(10000) }),
  z.object({ action: z.literal('report.submit'), country: z.enum(PK as [string, ...string[]]), comment: z.string().max(10000) }),
  z.object({ action: z.literal('report.reopen'), country: z.enum(PK as [string, ...string[]]) }),
]);

export const POST: APIRoute = async ({ locals, request, cookies }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const c = await osApi(locals.user, b.action.startsWith('ins.') ? 'dg dirreg rep agent' : 'dg rep', true);
  if (c instanceof Response) return c;
  const me = c.me!;
  const people = await allStaff();
  const sc = scopeState(c, cookies);

  if (b.action === 'ins.validate' || b.action === 'ins.reject' || b.action === 'ins.info') {
    const ids = b.action === 'ins.validate' ? b.ids : [b.id];
    const rows = await db.select().from(osInscription).where(inArray(osInscription.id, ids));
    // Bureau pays dans son périmètre ; dossiers escaladés (> 48 h) aussi pour le directeur régional et la DG
    const esc = new Set((await escalatedFor(me)).map((x) => x.id));
    if (!rows.length || rows.some((x) => !sc.inScope({ country: x.country, domain: x.domains }) && !esc.has(x.id))) return fail('Inscription hors de votre périmètre.', 403);
    if (b.action === 'ins.info') return (await askMore(b.id, b.message, me)) ? json({ ok: true, message: 'Demande envoyée ; le délai repart à zéro.' }) : fail('Inscription déjà traitée.');
    const n = await decideInscriptions(ids, b.action === 'ins.validate', me, people, b.action === 'ins.reject' ? b.reason : '');
    return json({ ok: true, message: b.action === 'ins.validate' ? `${n} inscription(s) validée(s) : fiches CRM créées, départements notifiés, entrepreneurs prévenus.` : 'Rejet notifié à l’entrepreneur.' });
  }

  if (me.prof !== 'dg' && !(me.prof === 'rep' && me.country === b.country)) return fail('Seul le représentant du pays rédige son rapport.', 403);
  const period = reportPeriod();
  const key = and(eq(osReport.country, b.country), eq(osReport.period, period));
  const [r] = await db.select().from(osReport).where(key);
  if (b.action === 'report.reopen') {
    await db.update(osReport).set({ status: 'Brouillon' }).where(key);
    return json({ ok: true, message: 'Rapport rouvert.' });
  }
  if (r?.status === 'Soumis') return fail('Rapport déjà soumis : rouvrez-le pour le modifier.');
  if (b.action === 'report.submit' && b.comment.trim().length < 20) return fail('Rédigez au moins quelques lignes.');
  const submitted = b.action === 'report.submit';
  await db.insert(osReport).values({ country: b.country, period, comment: b.comment, status: submitted ? 'Soumis' : 'Brouillon', ...(submitted ? { submittedBy: me.id, submittedAt: new Date() } : {}) })
    .onConflictDoUpdate({ target: [osReport.country, osReport.period], set: { comment: b.comment, status: submitted ? 'Soumis' : 'Brouillon', ...(submitted ? { submittedBy: me.id, submittedAt: new Date() } : {}) } });
  if (submitted) {
    await notifyStaff(people.filter((s) => s.prof === 'dirreg' && s.reg === regOf(b.country) && s.active).map((s) => s.id), `Rapport mensuel soumis : ${pn(b.country)}`, `/admin/reseau/rapport/${b.country}`, people);
    await audit(me.userId, 'os.rapport_mensuel.soumission', b.country, { periode: period });
  }
  return json({ ok: true, message: submitted ? 'Rapport soumis au bureau régional.' : 'Enregistré.' });
};
