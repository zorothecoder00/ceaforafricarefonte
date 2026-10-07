/* CEA OS — relations (prototype : Membres et inscriptions, Réseau territorial).
   Inscriptions : validées par le bureau pays sous 48 h ; au-delà, escaladées au directeur régional et à la Direction
   générale (Approbations). Une validation crée la fiche CRM, notifie les départements des domaines choisis et prévient
   l'entrepreneur (WhatsApp ou e-mail). */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { osInscription } from '../../db/schema/os';
import { contactMessage } from '../../db/schema/app';
import { crmContact } from '../../db/schema/crm';
import { sendEmail, sendWhatsApp } from '../messaging';
import { audit } from '../session';
import { notifyStaff } from './approvals';
import type { Person } from './core';
import { DOM, pn, regOf, type Dom } from './ref';

export type Inscription = typeof osInscription.$inferSelect;
export const hoursSince = (d: Date) => Math.round((Date.now() - new Date(d).getTime()) / 36e5);
/** Inscriptions en attente depuis plus de 48 h que l'utilisateur doit trancher (Direction générale, directeur régional). */
export async function escalatedFor(me: Person | null) {
  if (!me || !['dg', 'dirreg'].includes(me.prof)) return [];
  const l = await db.select().from(osInscription).where(and(eq(osInscription.status, 'En attente'), sql`${osInscription.slaFrom} < now() - interval '48 hours'`)).catch(() => []);
  return l.filter((x) => me.prof === 'dg' || regOf(x.country) === me.reg);
}

const tell = async (x: Inscription, text: string) => {
  try {
    if (x.phone) await sendWhatsApp(x.phone, `CEA FOR AFRICA : ${text}`);
    else if (x.email) await sendEmail(x.email, 'Votre inscription à CEA FOR AFRICA', `Bonjour ${x.name},\n\n${text}\n\n— CEA FOR AFRICA`);
  } catch (e) { console.error('[inscription] message impossible :', e instanceof Error ? e.message : e); }
};

/** Décision sur des inscriptions : validation (fiche CRM, départements notifiés, entrepreneur prévenu) ou rejet motivé. */
export async function decideInscriptions(ids: string[], ok: boolean, me: Person, people: Person[], reason = '') {
  const l = await db.select().from(osInscription).where(and(inArray(osInscription.id, ids), eq(osInscription.status, 'En attente')));
  for (const x of l) {
    await db.update(osInscription).set({ status: ok ? 'Validée' : 'Rejetée', reason: ok ? null : reason, decidedBy: me.id, decidedAt: new Date() }).where(eq(osInscription.id, x.id));
    if (x.messageId) await db.update(contactMessage).set({ status: 'traite' }).where(eq(contactMessage.id, x.messageId));
    if (ok) {
      // Fiche CRM 360° (sans doublon sur l'e-mail) ; consentement marketing non présumé
      const tags = ['membre', ...x.domains.map((d) => (d in DOM ? DOM[d as Dom].d : d))];
      await db.insert(crmContact).values({ name: x.name, email: x.email || null, phone: x.phone || null, country: x.country, sector: x.company, tags, source: `Inscription ${x.id}`, ownerId: me.userId }).onConflictDoNothing();
      for (const d of x.domains) await notifyStaff(people.filter((s) => s.domain === d && s.active && ['chef', 'agent', 'analyste'].includes(s.prof)).map((s) => s.id), `Nouveau membre ${d in DOM ? DOM[d as Dom].d : d} en ${pn(x.country)} : ${x.name}`, '/admin/membres', people);
      await tell(x, `votre inscription ${x.id} est validée par le bureau ${pn(x.country)}. Bienvenue dans le réseau ! Créez votre compte sur cea4africa.com avec ce numéro pour obtenir votre carte de membre.`);
    } else await tell(x, `votre inscription ${x.id} n'a pas pu être validée (${reason}). Contactez le bureau ${pn(x.country)} pour toute question.`);
    await audit(me.userId, ok ? 'os.inscription.validation' : 'os.inscription.rejet', x.id, ok ? {} : { motif: reason });
  }
  return l.length;
}

/** Demande de compléments : message à l'entrepreneur, le délai de 48 h repart à zéro. */
export async function askMore(id: string, text: string, me: Person) {
  const [x] = await db.update(osInscription).set({ slaFrom: new Date() }).where(and(eq(osInscription.id, id), eq(osInscription.status, 'En attente'))).returning();
  if (!x) return false;
  await tell(x, text);
  await audit(me.userId, 'os.inscription.complements', x.id);
  return true;
}

/** Membres validés par pays et domaine (domaine principal et domaines secondaires comptés). */
export async function memberBase(): Promise<Record<string, Record<string, number>>> {
  const rows = (await db.execute(sql`select country, d, count(*)::int n from os_inscription, jsonb_array_elements_text(domains) d where status = 'Validée' group by 1, 2`)).rows as { country: string; d: string; n: number }[];
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.country] ??= {})[r.d] = r.n;
  return out;
}

/** Période du rapport mensuel : le mois précédent (AAAA-MM). */
export const reportPeriod = (d = new Date()) => { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`; };
