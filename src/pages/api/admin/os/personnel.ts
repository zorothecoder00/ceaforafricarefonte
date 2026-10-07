/* CEA OS — fiches du personnel (prototype : Ressources humaines › Effectifs), profils « dg » et « rh ».
   POST { action: 'create', name, email?, poste, country, grade, managerId, salary, leaveDays? }
        → matricule EMPxxx ; le compte CEA OS est créé (ou rattaché s'il existe déjà) avec les droits du poste et une invitation part par e-mail.
   POST { action: 'update', id, phone?, salary, leaveDays, managerId, grade }
   POST { action: 'toggle', id } → départ (désactivation : accès révoqués, sessions fermées) ou réactivation. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { staff } from '../../../../db/schema/os';
import { user } from '../../../../db/schema/auth';
import { json, fail, audit, clientIp } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { nextEmp, staffById } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { createMember, inviteLink, closeSessions } from '../../../../lib/members';
import { DOM, GRADES, PDOM, PK, REF, pn, profOf, refT } from '../../../../lib/os/ref';

export const prerender = false;

const Id = z.string().regex(/^EMP\d{3,6}$/);
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'), name: z.string().trim().min(3, 'Indiquez le nom.').max(120),
    email: z.preprocess((v) => (v === '' ? undefined : v), z.email('Adresse e-mail invalide.').max(160).optional()),
    poste: z.string().refine((c) => REF.some((r) => r.c === c), 'Poste inconnu.'),
    country: z.enum(PK as [string, ...string[]]), grade: z.enum(GRADES), managerId: z.preprocess((v) => (v === '' ? undefined : v), Id.optional()),
    salary: z.coerce.number().int().min(0).max(1e9), leaveDays: z.coerce.number().min(0).max(120).optional().default(0),
  }),
  z.object({ action: z.literal('update'), id: Id, phone: z.string().trim().max(40).optional().default(''), salary: z.coerce.number().int().min(0).max(1e9), leaveDays: z.coerce.number().min(0).max(120), managerId: z.preprocess((v) => (v === '' ? undefined : v), Id.optional()), grade: z.enum(GRADES) }),
  z.object({ action: z.literal('toggle'), id: Id }),
]);

const slug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.');

export const POST: APIRoute = async ({ locals, request, url }) => {
  const c = await osApi(locals.user, 'dg rh');
  if (c instanceof Response) return c;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const ip = clientIp(request);
  const actor = locals.user!.id;

  if (b.action === 'create') {
    // Sans responsable : uniquement le sommet de l'organigramme (Direction générale), une seule fois
    if (b.managerId && !(await staffById(b.managerId))) return fail('Responsable introuvable.');
    const [dg] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.poste, 'A1'), eq(staff.active, true)));
    if (b.poste === 'A1' && dg) return fail(`Le poste de directeur général est déjà occupé (${dg.id}).`);
    if (!b.managerId && b.poste !== 'A1') return fail('Choisissez le responsable hiérarchique.');
    const email = (b.email ?? `${slug(b.name)}@cea4africa.com`).toLowerCase();
    const [taken] = await db.select({ id: staff.id }).from(staff).where(eq(staff.email, email));
    if (taken) return fail(`Cette adresse est déjà celle du collaborateur ${taken.id}.`);
    // Compte de connexion : rattachement d'un compte existant, sinon création avec invitation
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (existing) { const [linked] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, existing.id)); if (linked) return fail(`Ce compte est déjà rattaché au collaborateur ${linked.id}.`); }
    const userId = existing?.id ?? await createMember(b.name, email);
    const id = await nextEmp();
    const dom = PDOM[b.poste] ?? null;
    await db.insert(staff).values({
      id, userId, name: b.name, email, poste: b.poste, country: b.country, domain: dom, managerId: b.managerId ?? null, grade: b.grade,
      department: dom ? DOM[dom].n : profOf(b.poste) === 'rep' ? 'Bureau de représentation ' + pn(b.country) : '', salary: b.salary, leaveDays: b.leaveDays,
      onboarding: [false, false, false],
    });
    const inv = existing ? { sent: false } : await inviteLink(userId, url.origin, true);
    if (b.managerId) await notifyStaff([b.managerId], `Nouveau collaborateur dans votre équipe : ${b.name}`, '/admin/annuaire');
    await audit(actor, 'os.personnel.creation', id, { poste: b.poste, pays: b.country }, ip);
    return json({ ok: true, id, message: `${b.name} ajouté·e (${id}, ${refT(b.poste)}) ; compte CEA OS ${existing ? 'rattaché' : inv.sent ? 'créé, accès envoyés par e-mail' : 'créé (l’e-mail d’invitation n’a pas pu partir)'}.` });
  }

  const s = await staffById(b.id);
  if (!s) return fail('Collaborateur introuvable.', 404);
  if (b.action === 'update') {
    if (b.managerId === s.id) return fail('Un collaborateur ne peut pas être son propre responsable.');
    await db.update(staff).set({ phone: b.phone, salary: b.salary, leaveDays: b.leaveDays, managerId: b.managerId ?? null, grade: b.grade, updatedAt: new Date() }).where(eq(staff.id, s.id));
    await audit(actor, 'os.personnel.modification', s.id, { salaire: b.salary, conges: b.leaveDays }, ip);
    return json({ ok: true, message: 'Fiche mise à jour.' });
  }
  const me = (c as WithMe).me;
  if (me?.id === s.id) return fail('Vous ne pouvez pas désactiver votre propre compte.');
  await db.update(staff).set({ active: !s.active, updatedAt: new Date() }).where(eq(staff.id, s.id));
  if (s.active && s.userId) await closeSessions(s.userId);
  await audit(actor, s.active ? 'os.personnel.depart' : 'os.personnel.reactivation', s.id, {}, ip);
  return json({ ok: true, message: s.active ? 'Compte désactivé : accès révoqués immédiatement sur tous les appareils.' : 'Compte réactivé.' });
};
