/* Détection de fraude (CDC §14 « détection des faux comptes, des paiements suspects et des comportements anormaux »,
   §7.4 « annonces frauduleuses ou trompeuses », §11) : règles explicables qui signalent, sans jamais agir seules ;
   l'équipe examine chaque signal (Modération › Fraude) et décide (suspendre, refuser, ou écarter le signal).
   Un signal écarté est mémorisé dans le journal d'audit (action « fraude.ecarte ») et ne réapparaît plus. */
import { sql } from 'drizzle-orm';
import { db } from './db';
import { suspectReason } from './moderation';

export type Signal = { key: string; kind: 'compte' | 'paiement' | 'annonce'; subject: string; link: string; reasons: string[]; at: Date };

/** Messageries jetables : souvent utilisées pour les faux comptes. */
export const DISPOSABLE = ['mailinator.com', 'yopmail.com', 'yopmail.fr', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com'];
export const isDisposable = (email: string) => DISPOSABLE.includes(email.split('@')[1]?.toLowerCase() ?? '');

/** Signaux d'une offre d'emploi (texte de l'annonce + profil du recruteur). */
export async function jobReasons(j: { title: string; company: string; description: string | null; salary: string | null }, employer?: { email: string | null; createdAt: Date | null }) {
  const reasons: string[] = [];
  const text = `${j.title}\n${j.description ?? ''}`;
  const hit = await suspectReason(text);
  if (hit) reasons.push(`Expression des filtres de modération : « ${hit} »`);
  if (/frais (de|d')\s?(formation|inscription|dossier|visa|équipement|equipement)|payer (pour|avant)|caution|mandat cash/i.test(text)) reasons.push('Demande de paiement au candidat');
  if (/(whatsapp|telegram)\s*:?\s*\+?\d[\d\s]{7,}|\b\+?\d{3}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}\b/i.test(text)) reasons.push('Contact direct hors de la plateforme (numéro dans l’annonce)');
  if (/[\w.+-]+@(gmail|yahoo|hotmail|outlook)\.[a-z]+/i.test(text)) reasons.push('Adresse e-mail personnelle dans l’annonce');
  const big = (j.salary ?? '').replace(/\s/g, '').match(/\d{7,}/g)?.map(Number).sort((a, b) => b - a)[0];
  if (big && big > 10_000_000) reasons.push('Rémunération anormalement élevée');
  if (employer?.email && isDisposable(employer.email)) reasons.push('Compte recruteur avec une messagerie jetable');
  if (employer?.createdAt && Date.now() - employer.createdAt.getTime() < 86_400_000) reasons.push('Compte recruteur créé il y a moins de 24 heures');
  return reasons;
}

/** Signaux ouverts des 30 derniers jours, hors signaux écartés par l'équipe. */
export async function fraudSignals(): Promise<Signal[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const dismissed = new Set(((await db.execute(sql`select distinct target from audit_log where action = 'fraude.ecarte' and at > ${new Date(Date.now() - 400 * 86_400_000)}`)).rows as { target: string }[]).map((r) => r.target));
  const out: Signal[] = [];

  // Comptes : messagerie jetable, nom suspect, plusieurs comptes créés depuis la même adresse IP en 24 heures
  const users = (await db.execute(sql`
    select u.id, u.name, u.email, u.created_at,
      (select s.ip_address from session s where s.user_id = u.id order by s.created_at limit 1) ip
    from "user" u where u.created_at > ${since} order by u.created_at desc limit 500`)).rows as { id: string; name: string; email: string; created_at: Date; ip: string | null }[];
  const byIp = new Map<string, typeof users>();
  for (const u of users) if (u.ip) byIp.set(u.ip, [...(byIp.get(u.ip) ?? []), u]);
  for (const u of users) {
    const reasons: string[] = [];
    if (isDisposable(u.email)) reasons.push('Messagerie jetable');
    if (/https?:\/\/|www\.|\d{4,}/i.test(u.name)) reasons.push('Nom contenant un lien ou une longue suite de chiffres');
    const twins = u.ip ? (byIp.get(u.ip) ?? []).filter((x) => Math.abs(new Date(x.created_at).getTime() - new Date(u.created_at).getTime()) < 86_400_000) : [];
    // Seuil volontairement haut : sur les réseaux mobiles, de nombreux abonnés partagent la même adresse IP publique
    if (twins.length >= 5) reasons.push(`${twins.length} comptes créés depuis la même adresse IP en 24 heures`);
    if (reasons.length) out.push({ key: `compte:${u.id}`, kind: 'compte', subject: `${u.name} <${u.email}>`, link: `/admin/membres?q=${encodeURIComponent(u.email)}`, reasons, at: new Date(u.created_at) });
  }

  // Paiements : échecs répétés, rafales de paiements, montants inhabituels
  const pays = (await db.execute(sql`
    select p.user_id, max(u.email) email, count(*) filter (where p.status = 'echoue') failed, count(*) total, max(p.amount_xof) top, max(p.created_at) last,
      max(n) burst
    from payment p left join "user" u on u.id = p.user_id
    left join lateral (select count(*) n from payment q where q.user_id = p.user_id and q.created_at between p.created_at - interval '1 hour' and p.created_at) b on true
    where p.created_at > ${since} and p.user_id is not null group by p.user_id`)).rows as { user_id: string; email: string; failed: string; total: string; top: string; last: Date; burst: string }[];
  for (const p of pays) {
    const reasons: string[] = [];
    if (Number(p.failed) >= 3) reasons.push(`${p.failed} paiements échoués en 30 jours`);
    if (Number(p.burst) >= 5) reasons.push(`${p.burst} paiements en moins d’une heure`);
    if (Number(p.top) >= 5_000_000) reasons.push('Montant inhabituel (5 millions FCFA ou plus)');
    if (reasons.length) out.push({ key: `paiement:${p.user_id}`, kind: 'paiement', subject: p.email ?? p.user_id, link: '/admin/paiements', reasons, at: new Date(p.last) });
  }

  // Annonces d'emploi en attente ou récentes
  const jobs = (await db.execute(sql`
    select j.id, j.title, j.company, j.description, j.salary, j.created_at, u.email, u.created_at ucreated
    from job j left join "user" u on u.id = j.employer_id where j.created_at > ${since} and j.status in ('en_moderation', 'publiee') order by j.created_at desc limit 300`)).rows as { id: string; title: string; company: string; description: string | null; salary: string | null; created_at: Date; email: string | null; ucreated: Date | null }[];
  for (const j of jobs) {
    const reasons = await jobReasons(j, { email: j.email, createdAt: j.ucreated ? new Date(j.ucreated) : null });
    if (reasons.length) out.push({ key: `annonce:${j.id}`, kind: 'annonce', subject: `${j.title} — ${j.company}`, link: '/admin/emplois', reasons, at: new Date(j.created_at) });
  }

  return out.filter((s) => !dismissed.has(s.key)).sort((a, b) => b.at.getTime() - a.at.getTime());
}
