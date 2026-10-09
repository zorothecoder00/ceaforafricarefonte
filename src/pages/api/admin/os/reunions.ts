/* CEA OS — réunions (prototype › newMeeting, pAgenda).
   POST { action: 'create', title, date, hour, place, participants[], agenda } → invitations notifiées
   POST { action: 'cr', id, minutes, decisions, actions } → compte rendu diffusé ; décisions (une par ligne) inscrites au
        registre (décidées si la Direction générale rédige, sinon en attente de sa validation) ; actions (une par ligne)
        créées en tâches pour le rédacteur, échéance à 7 jours. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osMeeting, osDecision, osTask } from '../../../../db/schema/os';
import { json, fail, audit } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { allStaff } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { dstr } from '../../../../lib/os/ref';

export const prerender = false;

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'), title: z.string().trim().min(3, 'Indiquez l’objet.').max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date.'),
    hour: z.string().regex(/^\d{2}:\d{2}$/), place: z.string().trim().max(200).default('Visio'),
    participants: z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : v ? [v] : [])), agenda: z.string().trim().max(4000).default(''),
  }),
  z.object({ action: z.literal('cr'), id: z.uuid(), minutes: z.string().trim().min(3, 'Rédigez le compte rendu.').max(20000), decisions: z.string().max(4000).default(''), actions: z.string().max(4000).default('') }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const people = await allStaff();
  if (b.action === 'create') {
    const parts = [me.id, ...b.participants.filter((x) => x !== me.id && people.some((s) => s.id === x))];
    const at = new Date(`${b.date}T${b.hour}:00`);
    const [m] = await db.insert(osMeeting).values({ title: b.title, at, hour: b.hour, place: b.place || 'Visio', participants: parts, agenda: b.agenda, organizer: me.id }).returning();
    await notifyStaff(parts.filter((x) => x !== me.id), `Invitation : ${m.title} le ${dstr(at)} à ${b.hour}`, '/os/agenda', people);
    await audit(me.userId, 'os.reunion.creation', m.id, { participants: parts.length });
    return json({ ok: true, message: `Invitations envoyées à ${parts.length - 1} participant(s).` });
  }
  const [m] = await db.select().from(osMeeting).where(eq(osMeeting.id, b.id));
  if (!m) return fail('Réunion introuvable.', 404);
  if (!m.participants.includes(me.id) && me.prof !== 'dg') return fail('Seuls les participants rédigent le compte rendu.', 403);
  const dec = lines(b.decisions);
  await db.update(osMeeting).set({ minutes: b.minutes, decisions: dec }).where(eq(osMeeting.id, m.id));
  if (dec.length) await db.insert(osDecision).values(dec.map((t) => ({ text: `${t} (${m.title})`, status: me.prof === 'dg' ? 'Décidé' : 'En attente', source: m.title, by: me.id })));
  const acts = lines(b.actions);
  if (acts.length) await db.insert(osTask).values(acts.map((t) => ({ title: t, owner: me.id, country: me.country, domain: me.domain ?? 'prj', due: new Date(Date.now() + 7 * 864e5), createdBy: me.id })));
  await notifyStaff(m.participants, `Compte rendu disponible : ${m.title}`, '/os/agenda', people);
  if (dec.length && me.prof !== 'dg') await notifyStaff(people.filter((s) => s.prof === 'dg' && s.active).map((s) => s.id), `Décision(s) à valider : ${m.title}`, '/os/approbations', people);
  await audit(me.userId, 'os.reunion.compte_rendu', m.id, { decisions: dec.length, actions: acts.length });
  return json({ ok: true, message: 'Compte rendu diffusé ; décisions ajoutées au registre, actions créées.' });
};
