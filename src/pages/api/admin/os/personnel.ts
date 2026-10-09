/* CEA OS — fiches du personnel (prototype : Ressources humaines › Effectifs), profils « dg » et « rh ».
   POST { action: 'create', name, email?, poste, country, grade, managerId, salary, leaveDays? }
        → matricule EMPxxx ; le compte CEA OS est créé (ou rattaché s'il existe déjà) avec les droits du poste et une invitation part par e-mail
          (si l'e-mail ne part pas : { link } = lien d'invitation à transmettre soi-même).
   GET ?q=… → comptes du site sans fiche (nom, e-mail, téléphone, pays du profil), pour le rattachement.
   POST { action: 'link', userId, poste, country, grade, managerId, salary, leaveDays? } → fiche créée sur un compte existant
        (nom, e-mail et téléphone repris du compte ; accès immédiat, sans invitation).
   POST { action: 'invite', id } → renvoi de l'invitation tant que le compte n'a pas de mot de passe ({ link } si l'e-mail ne part pas).
   POST { action: 'update', id, phone?, salary, leaveDays, managerId, grade }
   POST { action: 'toggle', id } → départ (désactivation : accès révoqués, sessions fermées) ou réactivation. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, notExists } from 'drizzle-orm';
import { matchAll, anyPrefix } from '../../../../lib/fold';
import { search } from '../../../../lib/fuzzy';
import { db } from '../../../../lib/db';
import { staff } from '../../../../db/schema/os';
import { user } from '../../../../db/schema/auth';
import { profile } from '../../../../db/schema/app';
import { json, fail, audit, clientIp } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { nextEmp, staffById } from '../../../../lib/os/core';
import { notifyStaff } from '../../../../lib/os/approvals';
import { createMember, inviteLink, closeSessions, hasPassword } from '../../../../lib/members';
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
  z.object({ action: z.literal('invite'), id: Id }),
  z.object({
    action: z.literal('link'), userId: z.string().min(1, 'Choisissez le compte à rattacher.').max(64),
    poste: z.string().refine((c) => REF.some((r) => r.c === c), 'Poste inconnu.'),
    country: z.enum(PK as [string, ...string[]]), grade: z.enum(GRADES), managerId: z.preprocess((v) => (v === '' ? undefined : v), Id.optional()),
    salary: z.coerce.number().int().min(0).max(1e9), leaveDays: z.coerce.number().min(0).max(120).optional().default(0),
  }),
]);

const slug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.');

/** Comptes du site sans fiche du personnel, par nom, e-mail ou téléphone (rattachement d'un compte existant). */
export const GET: APIRoute = async ({ locals, url }) => {
  const c = await osApi(locals.user, 'dg rh');
  if (c instanceof Response) return c;
  const q = (url.searchParams.get('q') ?? '').trim();
  // Mots dans n'importe quel ordre, sans tenir compte des accents ni des majuscules
  const m = q.length >= 2 ? matchAll([user.name, user.email], q, user.phoneNumber) : undefined;
  if (!m) return json({ ok: true, accounts: [] });
  const cols = { id: user.id, name: user.name, email: user.email, phone: user.phoneNumber, country: profile.country };
  const free = notExists(db.select({ x: staff.id }).from(staff).where(eq(staff.userId, user.id)));
  let accounts = await db.select(cols).from(user).leftJoin(profile, eq(profile.userId, user.id)).where(and(m, free)).orderBy(user.name).limit(8);
  // Rien d'exact : tolérance aux fautes de frappe (« Agbodjam », « Aisha ») sur une présélection large, classée par pertinence
  const pre = accounts.length ? undefined : anyPrefix([user.name, user.email], q);
  if (pre) accounts = search(await db.select(cols).from(user).leftJoin(profile, eq(profile.userId, user.id)).where(and(pre, free)).limit(500), q, (a) => [a.name, a.email], 8);
  // Adresses techniques des comptes créés par téléphone : non affichées
  return json({ ok: true, accounts: accounts.map((a) => ({ ...a, email: a.email.endsWith('@telephone.cea4africa.com') ? '' : a.email, country: a.country && PK.includes(a.country) ? a.country : null })) });
};

export const POST: APIRoute = async ({ locals, request, url }) => {
  const c = await osApi(locals.user, 'dg rh');
  if (c instanceof Response) return c;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const ip = clientIp(request);
  const actor = locals.user!.id;

  if (b.action === 'create' || b.action === 'link') {
    // Sans responsable : uniquement le sommet de l'organigramme (Direction générale), une seule fois
    if (b.managerId && !(await staffById(b.managerId))) return fail('Responsable introuvable.');
    const [dg] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.poste, 'A1'), eq(staff.active, true)));
    if (b.poste === 'A1' && dg) return fail(`Le poste de directeur général est déjà occupé (${dg.id}).`);
    if (!b.managerId && b.poste !== 'A1') return fail('Choisissez le responsable hiérarchique.');
    // Compte de connexion : compte choisi (link), compte existant à la même adresse, sinon création avec invitation
    let existing: { id: string; name: string; email: string; phone: string | null } | undefined;
    if (b.action === 'link') {
      [existing] = await db.select({ id: user.id, name: user.name, email: user.email, phone: user.phoneNumber }).from(user).where(eq(user.id, b.userId));
      if (!existing) return fail('Compte introuvable.', 404);
    } else {
      const email = (b.email ?? `${slug(b.name)}@cea4africa.com`).toLowerCase();
      [existing] = await db.select({ id: user.id, name: user.name, email: user.email, phone: user.phoneNumber }).from(user).where(eq(user.email, email));
    }
    if (existing) { const [linked] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, existing.id)); if (linked) return fail(`Ce compte est déjà rattaché au collaborateur ${linked.id}.`); }
    const mail = (existing?.email ?? (b.action === 'create' ? (b.email ?? `${slug(b.name)}@cea4africa.com`) : '')).toLowerCase();
    const [taken] = await db.select({ id: staff.id }).from(staff).where(eq(staff.email, mail));
    if (taken) return fail(`Cette adresse est déjà celle du collaborateur ${taken.id}.`);
    const name = b.action === 'link' ? existing!.name : b.name;
    const email = mail;
    const userId = existing?.id ?? await createMember(name, email);
    const id = await nextEmp();
    const dom = PDOM[b.poste] ?? null;
    await db.insert(staff).values({
      id, userId, name, email, phone: existing?.phone ?? '', poste: b.poste, country: b.country, domain: dom, managerId: b.managerId ?? null, grade: b.grade,
      department: dom ? DOM[dom].n : profOf(b.poste) === 'rep' ? 'Bureau de représentation ' + pn(b.country) : '', salary: b.salary, leaveDays: b.leaveDays,
      onboarding: [false, false, false],
    });
    const inv: { url?: string; sent: boolean } = existing ? { sent: false } : await inviteLink(userId, url.origin, true);
    if (b.managerId) await notifyStaff([b.managerId], `Nouveau collaborateur dans votre équipe : ${name}`, '/os/annuaire');
    await audit(actor, b.action === 'link' ? 'os.personnel.rattachement' : 'os.personnel.creation', id, { poste: b.poste, pays: b.country, compte: userId }, ip);
    const failed = !existing && !inv.sent && !!inv.url;
    return json({ ok: true, id, ...(failed ? { link: inv.url } : {}), message: `${name} ajouté·e (${id}, ${refT(b.poste)}) ; compte CEA OS ${existing ? 'rattaché : accès immédiat avec ses identifiants habituels' : inv.sent ? 'créé, accès envoyés par e-mail' : 'créé, mais l’e-mail d’invitation n’a pas pu partir : transmettez-lui ce lien vous-même (valable 7 jours)'}.` });
  }

  const s = await staffById(b.id);
  if (!s) return fail('Collaborateur introuvable.', 404);
  if (b.action === 'update') {
    if (b.managerId === s.id) return fail('Un collaborateur ne peut pas être son propre responsable.');
    await db.update(staff).set({ phone: b.phone, salary: b.salary, leaveDays: b.leaveDays, managerId: b.managerId ?? null, grade: b.grade, updatedAt: new Date() }).where(eq(staff.id, s.id));
    await audit(actor, 'os.personnel.modification', s.id, { salaire: b.salary, conges: b.leaveDays }, ip);
    return json({ ok: true, message: 'Fiche mise à jour.' });
  }
  if (b.action === 'invite') {
    // Renvoi de l'invitation tant que la personne n'a pas choisi son mot de passe (jamais pour un compte déjà utilisé :
    // le lien affiché permettrait de prendre la main sur ce compte)
    if (!s.userId) return fail('Cette fiche n’a pas de compte de connexion.');
    if (!s.active) return fail('Collaborateur désactivé.');
    if (await hasPassword(s.userId)) return fail('Ce compte est déjà activé : la personne peut utiliser « Mot de passe oublié » sur la page de connexion.');
    const inv = await inviteLink(s.userId, url.origin, true);
    await audit(actor, 'os.personnel.invitation', s.id, { envoyee: inv.sent }, ip);
    return json({ ok: true, ...(!inv.sent && { link: inv.url }), message: inv.sent ? `Invitation renvoyée à ${s.email}.` : 'L’e-mail n’a pas pu partir : transmettez ce lien vous-même (valable 7 jours).' });
  }
  const me = (c as WithMe).me;
  if (me?.id === s.id) return fail('Vous ne pouvez pas désactiver votre propre compte.');
  await db.update(staff).set({ active: !s.active, updatedAt: new Date() }).where(eq(staff.id, s.id));
  if (s.active && s.userId) await closeSessions(s.userId);
  await audit(actor, s.active ? 'os.personnel.depart' : 'os.personnel.reactivation', s.id, {}, ip);
  return json({ ok: true, message: s.active ? 'Compte désactivé : accès révoqués immédiatement sur tous les appareils.' : 'Compte réactivé.' });
};
