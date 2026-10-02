/* Fichier agenda (.ics) d'un rendez-vous (CDC §10).
   GET ?rdv=<référence>&k=<clé>  → rendez-vous avec une équipe CEA (lien signé envoyé par e-mail, sans compte)
   GET ?mentorat=<id>            → séance de mentorat, réservée au mentor et à l'entrepreneur connectés */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../../lib/db';
import { appointment, mentoringSession } from '../../db/schema/app';
import { user } from '../../db/schema/auth';
import { fail, requireUser } from '../../lib/session';
import { agendaKey, appointmentMeeting, meetingIcs, mentoringMeeting, type Meeting } from '../../lib/agenda';

export const prerender = false;

const ics = (m: Meeting) => new Response(meetingIcs(m), {
  headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${m.uid}.ics"`, 'Cache-Control': 'no-store, private' },
});
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const GET: APIRoute = async ({ url, locals }) => {
  const ref = url.searchParams.get('rdv');
  if (ref) {
    if (!same(url.searchParams.get('k') ?? '', agendaKey(ref))) return fail('Lien invalide.', 403);
    const [a] = await db.select().from(appointment).where(eq(appointment.reference, ref));
    if (!a || a.cancelledAt) return fail('Rendez-vous introuvable ou annulé.', 404);
    return ics(appointmentMeeting(a));
  }
  const id = url.searchParams.get('mentorat');
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const u = requireUser(locals.user);
    if (u instanceof Response) return u;
    const [s] = await db.select().from(mentoringSession).where(eq(mentoringSession.id, id));
    if (!s || (s.mentorId !== u.id && s.menteeId !== u.id)) return fail('Séance introuvable.', 404);
    if (s.status === 'annulee') return fail('Séance annulée.', 404);
    const [other] = await db.select({ name: user.name }).from(user).where(eq(user.id, s.mentorId === u.id ? s.menteeId : s.mentorId));
    return ics(mentoringMeeting(s, other?.name ?? 'CEA'));
  }
  return fail('Paramètre manquant.', 400);
};
