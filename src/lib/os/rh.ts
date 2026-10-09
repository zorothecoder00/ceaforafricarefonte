/* CEA OS — ressources humaines (prototype : paie, recrutement, embauche).
   Paie : brut × taux de la devise du pays (Paramétrage › paie), bulletins publiés, écriture de paie (journal PA).
   Recrutement : grille d'entretien pondérée (note ≥ 3 sur 4 et intégrité ≠ 1 pour être recrutable), offre dans la fourchette
   du grade = embauche immédiate, hors fourchette = approbation de la Direction générale. Embauche : fiche personnel,
   compte CEA OS avec invitation, intégration de 90 jours. */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { staff, osPayroll, osRecruit, osCandidate, type PayLine } from '../../db/schema/os';
import { user } from '../../db/schema/auth';
import { getSetting } from '../settings';
import { createMember, inviteLink } from '../members';
import { audit } from '../session';
import { post } from './ledger';
import { nextEmp, type Person } from './core';
import { notifyStaff } from './approvals';
import { DOM, PAYS, PDOM, gradeOf, pn, profOf, refT } from './ref';

/** Calcule et valide la paie d'un mois pour les collaborateurs actifs ; écriture de paie et notification des bulletins. */
export async function runPayroll(month: string, people: Person[], by: string): Promise<PayLine[]> {
  const { rates } = await getSetting('paie');
  const lines: PayLine[] = people.filter((s) => s.active && s.salary > 0).map((s) => {
    const r = rates[PAYS[s.country]?.[2] ?? 'XOF'] ?? rates.XOF ?? [0, 0, 0];
    const cs = Math.round(s.salary * r[0]), imp = Math.round((s.salary - cs) * r[2]), cp = Math.round(s.salary * r[1]);
    return { id: s.id, brut: s.salary, cs, imp, net: s.salary - cs - imp, cp, country: s.country };
  });
  await db.insert(osPayroll).values({ month, lines, by });
  const sum = (k: keyof PayLine) => lines.reduce((a, l) => a + (l[k] as number), 0);
  if (lines.length) await post('PA', `Paie ${month}`, [['661', sum('brut'), 0], ['664', sum('cp'), 0], ['422', 0, sum('net')], ['431', 0, sum('cs') + sum('cp')], ['447', 0, sum('imp')]], { country: 'TG', domain: 'prj', ref: `PAIE-${month}`, by });
  await notifyStaff(lines.map((l) => l.id), `Votre bulletin de paie de ${month} est disponible.`, '/os/moi/paie', people);
  return lines;
}

/* Grille d'entretien de recrutement (notes de 1 à 4) */
export const WEIGHTS: [string, string, number][] = [['exp', 'Expérience métier', 0.3], ['tech', 'Compétences techniques', 0.25], ['ent', "Sens de l'entrepreneur", 0.15], ['integ', 'Intégrité', 0.15], ['coop', 'Coopération', 0.1], ['lang', 'Langues', 0.05]];
export const scoreOf = (sc?: Record<string, number> | null) => (sc ? WEIGHTS.reduce((a, w) => a + (sc[w[0]] || 0) * w[2], 0) : null);
export const eligible = (sc?: Record<string, number> | null) => !!sc && (scoreOf(sc) ?? 0) >= 3 && sc.integ !== 1;
/** Niveau d'approbation d'un recrutement : agents (validation régionale) ou cadres (Direction générale). */
export const recruitLevel = (code: string) => (['Agent', 'Agent de maîtrise'].includes(gradeOf(code)) ? 'agent' : 'cadre');

type Recruit = typeof osRecruit.$inferSelect;
type Candidate = typeof osCandidate.$inferSelect;
/** Embauche : fiche personnel au poste du recrutement, compte CEA OS (invitation), intégration de 90 jours. */
export async function hire(x: Recruit, c: Candidate, salary: number, people: Person[], actor: string | null, origin: string) {
  const id = await nextEmp();
  const email = c.email.toLowerCase();
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const linked = existing && (await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, existing.id)))[0];
  const userId = existing && !linked ? existing.id : existing ? null : await createMember(c.name, email);
  const dom = PDOM[x.poste] ?? null;
  await db.insert(staff).values({
    id, userId, name: c.name, email, poste: x.poste, country: x.country, domain: dom, managerId: x.byStaff, grade: gradeOf(x.poste),
    department: dom ? DOM[dom].n : profOf(x.poste) === 'rep' ? 'Bureau de représentation ' + pn(x.country) : '', salary, onboarding: [false, false, false],
  });
  const inv = userId && !existing ? await inviteLink(userId, origin, true).catch(() => null) : { sent: true };
  // Invitation non partie : les RH la renvoient (ou copient le lien) depuis RH › Effectifs
  if (!inv?.sent) await notifyStaff(people.filter((s) => s.prof === 'rh' && s.active).map((s) => s.id), `L'invitation de ${c.name} (${id}) n'a pas pu partir par e-mail : utilisez « Invitation » sur sa fiche dans RH › Effectifs`, '/os/rh', people);
  await db.update(osRecruit).set({ status: 'Pourvu' }).where(eq(osRecruit.id, x.id));
  await db.update(osCandidate).set({ status: 'Embauché·e' }).where(eq(osCandidate.id, c.id));
  if (x.byStaff) await notifyStaff([x.byStaff], `Arrivée de ${c.name} (${x.poste}) : compte CEA OS créé avec le profil du poste`, '/os/equipe', people);
  await notifyStaff(people.filter((s) => s.prof === 'it' && s.active).map((s) => s.id), `Préparer le matériel de ${c.name}`, '/os/organisation', people);
  await audit(actor, 'os.personnel.creation', id, { embauche: x.id, poste: x.poste, profil: profOf(x.poste) });
  return { id, name: c.name, poste: refT(x.poste) };
}
