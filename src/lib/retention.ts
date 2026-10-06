/* Conservation des données (CDC §15.1 « durées de conservation définies, suppression ou anonymisation automatique ») :
   applique chaque jour les durées de la politique de confidentialité (réglables dans Paramétrage › Conservation des données).
   - données techniques (mesures de performance, sondes de disponibilité), sessions et codes expirés : supprimés ;
   - notifications anciennes, inscriptions à la lettre jamais confirmées ou désinscrites : supprimées ;
   - messages de contact traités ou clos : anonymisés (nom, coordonnées, contenu et échanges retirés ; la statistique reste) ;
   - candidatures non retenues (programmes et emplois) : réponses effacées / candidature supprimée ;
   - comptes inactifs : préavis par e-mail, puis suppression si aucune connexion pendant le préavis (sauf compte de l'équipe,
     dossier Kapital en cours) ;
   - journal d'audit : entrées de plus de 5 ans supprimées (seule suppression que la base autorise).
   dryRun : compte ce qui serait traité, sans rien modifier (aperçu du back-office). */
import { sql } from 'drizzle-orm';
import { db } from './db';
import { getSetting } from './settings';
import { sendEmail } from './messaging';
import { siteUrl } from './support';
import { audit } from './session';

const STAFF = ['admin', 'direction', 'editeur', 'charge_programme', 'analyste', 'comite', 'conformite', 'responsable_pays'];
const n = (r: { rowCount?: number | null; rows?: unknown[] }) => r.rowCount ?? r.rows?.length ?? 0;
const ago = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);
const monthsAgo = (now: Date, m: number) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - m); return d; };

export type RetentionReport = Record<string, number>;

export async function runRetention(now = new Date(), { dryRun = false } = {}): Promise<RetentionReport | { disabled: true }> {
  const p = await getSetting('conservation');
  if (!p.enabled && !dryRun) return { disabled: true };
  const r: RetentionReport = {};
  const tech = ago(now, p.technicalDays), notif = monthsAgo(now, p.notificationsMonths), news = ago(now, p.newsletterPendingDays);
  const contact = monthsAgo(now, p.contactMonths), rejected = monthsAgo(now, p.rejectedMonths), auditLimit = monthsAgo(now, p.auditMonths);
  const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(sql`select count(*) n from (${q}) x`)).rows[0] as { n: string }).n);
  const run = async (key: string, select: ReturnType<typeof sql>, change: ReturnType<typeof sql>) => {
    r[key] = dryRun ? await count(select) : n(await db.execute(change));
  };

  await run('mesures_techniques', sql`select 1 from web_vital where at < ${tech} union all select 1 from health_sample where at < ${tech}`,
    sql`with a as (delete from web_vital where at < ${tech} returning 1), b as (delete from health_sample where at < ${tech} returning 1) select * from a union all select * from b`);
  await run('sessions_expirees', sql`select 1 from session where expires_at < ${ago(now, 1)} union all select 1 from verification where expires_at < ${ago(now, 1)}`,
    sql`with a as (delete from session where expires_at < ${ago(now, 1)} returning 1), b as (delete from verification where expires_at < ${ago(now, 1)} returning 1) select * from a union all select * from b`);
  await run('notifications', sql`select 1 from notification where created_at < ${notif}`, sql`delete from notification where created_at < ${notif}`);
  await run('lettre_non_confirmee', sql`select 1 from newsletter_subscription where (confirmed_at is null and created_at < ${news}) or unsubscribed_at < ${news}`,
    sql`delete from newsletter_subscription where (confirmed_at is null and created_at < ${news}) or unsubscribed_at < ${news}`);
  // Messages de contact anciens et traités : anonymisés (le volume et les délais restent pour les statistiques du support)
  await run('messages_contact', sql`select 1 from contact_message where status in ('traite', 'clos') and created_at < ${contact} and name <> 'Anonymisé'`,
    sql`with t as (update contact_message set name = 'Anonymisé', contact = '', message = '[contenu supprimé après la durée de conservation]', user_id = null, csat_comment = null where status in ('traite', 'clos') and created_at < ${contact} and name <> 'Anonymisé' returning id), d as (delete from ticket_reply where message_id in (select id from t) returning 1) select id from t`);
  // Candidatures non retenues : réponses effacées (programmes), candidature supprimée (emplois)
  await run('candidatures_programmes', sql`select 1 from programme_application where status in ('refusee', 'retiree') and updated_at < ${rejected} and data <> '{}'::jsonb`,
    sql`update programme_application set data = '{}'::jsonb where status in ('refusee', 'retiree') and updated_at < ${rejected} and data <> '{}'::jsonb`);
  await run('candidatures_emplois', sql`select 1 from job_application where status = 'refus' and updated_at < ${rejected}`, sql`delete from job_application where status = 'refus' and updated_at < ${rejected}`);
  // Journal d'audit : la base n'autorise la suppression que des entrées de plus de 5 ans (migration 0033)
  await run('journal_audit', sql`select 1 from audit_log where at < ${auditLimit}`, sql`delete from audit_log where at < ${auditLimit}`);

  // Comptes inactifs : dernière activité = dernière session (ou création du compte)
  const inactive = monthsAgo(now, p.inactiveMonths);
  const idle = (await db.execute(sql`
    select u.id, u.name, u.email, coalesce((select max(s.updated_at) from session s where s.user_id = u.id), u.created_at) as last,
      (select max(a.at) from audit_log a where a.action = 'conservation.preavis' and a.target = u.id) as noticed
    from "user" u
    where coalesce((select max(s.updated_at) from session s where s.user_id = u.id), u.created_at) < ${inactive}
      and not exists (select 1 from user_role ur where ur.user_id = u.id and ur.role::text in (${sql.join(STAFF.map((s) => sql`${s}`), sql`, `)}))
      and not exists (select 1 from kapital.dossier d where d.owner_id = u.id)
    limit 500`)).rows as { id: string; name: string; email: string; last: Date; noticed: Date | null }[];
  let notices = 0, deleted = 0;
  for (const u of idle) {
    const noticed = u.noticed && new Date(u.noticed) > new Date(u.last) ? new Date(u.noticed) : null;
    if (!noticed) {
      notices++;
      if (dryRun) continue;
      if (u.email && !u.email.endsWith('@telephone.cea4africa.com')) {
        await sendEmail(u.email, 'Votre compte CEA FOR AFRICA va être supprimé', `Bonjour ${u.name},\n\nVous ne vous êtes pas connecté à CEA FOR AFRICA depuis plus de ${Math.round(p.inactiveMonths / 12)} ans. Conformément à notre politique de confidentialité, votre compte et vos données seront supprimés dans ${p.noticeDays} jours.\n\nPour le conserver, il suffit de vous connecter : ${siteUrl()}/connexion\n\nCEA FOR AFRICA`).catch(() => {});
      }
      await audit(null, 'conservation.preavis', u.id, { days: p.noticeDays });
    } else if (noticed < ago(now, p.noticeDays)) {
      deleted++;
      if (dryRun) continue;
      await audit(null, 'conservation.suppression_compte', u.id, { lastActivity: new Date(u.last).toISOString() });
      await db.execute(sql`delete from "user" where id = ${u.id}`);
    }
  }
  r.comptes_preavis = notices;
  r.comptes_supprimes = deleted;
  if (!dryRun) await audit(null, 'conservation.passage', 'conservation', r);
  return r;
}

export const RETENTION_LABEL: Record<string, string> = {
  mesures_techniques: 'Mesures techniques supprimées', sessions_expirees: 'Sessions et codes expirés supprimés', notifications: 'Notifications supprimées',
  lettre_non_confirmee: 'Inscriptions à la lettre non confirmées ou désinscrites', messages_contact: 'Messages de contact anonymisés',
  candidatures_programmes: 'Candidatures de programme non retenues effacées', candidatures_emplois: 'Candidatures d’emploi non retenues supprimées',
  journal_audit: 'Entrées du journal d’audit de plus de 5 ans', comptes_preavis: 'Comptes inactifs prévenus', comptes_supprimes: 'Comptes inactifs supprimés',
};
