/* Constructeur de rapports (CDC §12, analytique) : un jeu de données, un regroupement, une mesure, une période, un pays.
   Les regroupements et mesures sont des expressions SQL fixées ici (listes blanches) : rien de ce que choisit l'utilisateur n'est du SQL.
   Chaque jeu exige le droit de lecture de son objet (§18) ; la portée pays d'un responsable pays s'applique quand le jeu a un pays. */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from './db';
import type { Obj } from './rbac';

type Def = { label: string; expr: string };
type Dataset = { label: string; obj: Obj; from: string; date: string; where?: string; country?: string; dims: Record<string, Def>; measures: Record<string, Def> };
const month = (d: string): Def => ({ label: 'Mois', expr: `to_char(date_trunc('month', ${d}), 'YYYY-MM')` });
const count: Def = { label: 'Nombre', expr: 'count(*)' };

export const DATASETS: Record<string, Dataset> = {
  membres: {
    label: 'Inscriptions de membres', obj: 'membres', from: '"user" u left join profile p on p.user_id = u.id', date: 'u.created_at', country: 'p.country',
    dims: { mois: month('u.created_at'), pays: { label: 'Pays', expr: "coalesce(p.country, '—')" }, secteur: { label: 'Secteur', expr: "coalesce(p.sector, '—')" }, langue: { label: 'Langue', expr: "coalesce(p.lang, 'fr')" } },
    measures: { nombre: count },
  },
  adhesions: {
    label: 'Adhésions', obj: 'membres', from: 'membership m left join profile p on p.user_id = m.user_id', date: 'm.starts_at', country: 'p.country',
    dims: { mois: month('m.starts_at'), formule: { label: 'Formule', expr: 'm.plan::text' }, statut: { label: 'Statut', expr: 'm.status::text' }, pays: { label: 'Pays', expr: "coalesce(p.country, '—')" } },
    measures: { nombre: count },
  },
  paiements: {
    label: 'Paiements encaissés', obj: 'paiements', from: 'payment pa left join profile p on p.user_id = pa.user_id', date: 'pa.paid_at', where: "pa.status = 'reussi'", country: 'p.country',
    dims: { mois: month('pa.paid_at'), objet: { label: 'Objet', expr: 'pa.purpose::text' }, moyen: { label: 'Moyen de paiement', expr: "coalesce(pa.method, '—')" }, pays: { label: 'Pays', expr: "coalesce(p.country, '—')" } },
    measures: { nombre: count, montant: { label: 'Montant (FCFA)', expr: 'sum(pa.amount_xof)' }, moyen: { label: 'Panier moyen (FCFA)', expr: 'round(avg(pa.amount_xof))' } },
  },
  factures: {
    label: 'Facturation', obj: 'paiements', from: 'invoice i', date: 'i.issued_at', where: "i.status <> 'annulee'",
    dims: { mois: month('i.issued_at'), objet: { label: 'Objet', expr: 'i.purpose' }, type: { label: 'Type', expr: 'i.kind::text' }, statut: { label: 'Statut', expr: 'i.status::text' } },
    measures: { nombre: count, ttc: { label: 'Montant TTC (FCFA)', expr: 'sum(i.total_xof)' } },
  },
  billets: {
    label: 'Billets émis', obj: 'contenus', from: 'event_ticket t', date: 't.created_at',
    dims: { mois: month('t.created_at'), evenement: { label: 'Événement', expr: 't.event_id' }, categorie: { label: 'Catégorie', expr: 't.ticket_type' }, statut: { label: 'Statut', expr: 't.status::text' } },
    measures: { nombre: count, recettes: { label: 'Recettes (FCFA)', expr: 'sum(t.price_xof)' } },
  },
  cours: {
    label: "Inscriptions à l'Académie", obj: 'contenus', from: 'enrollment e left join profile p on p.user_id = e.user_id', date: 'e.started_at', country: 'p.country',
    dims: { mois: month('e.started_at'), cours: { label: 'Cours', expr: 'e.course_id' }, termine: { label: 'Terminé', expr: "case when e.completed_at is null then 'en cours' else 'terminé' end" }, pays: { label: 'Pays', expr: "coalesce(p.country, '—')" } },
    measures: { nombre: count },
  },
  candidatures: {
    label: 'Candidatures aux programmes', obj: 'candidature', from: 'programme_application a left join profile p on p.user_id = a.user_id', date: 'a.submitted_at', where: "a.status <> 'brouillon'", country: 'p.country',
    dims: { mois: month('a.submitted_at'), programme: { label: 'Programme', expr: 'a.programme' }, statut: { label: 'Statut', expr: 'a.status::text' }, pays: { label: 'Pays', expr: "coalesce(p.country, '—')" } },
    measures: { nombre: count, note: { label: 'Note moyenne', expr: 'round(avg(a.score))' } },
  },
  campagnes: {
    label: 'Envois de campagnes', obj: 'campagnes', from: 'campaign_send s join campaign c on c.id = s.campaign_id', date: 's.sent_at', where: "s.status = 'envoye'",
    dims: { campagne: { label: 'Campagne', expr: 'c.name' }, canal: { label: 'Canal', expr: 'c.channel::text' }, mois: month('s.sent_at'), variante: { label: 'Variante A/B', expr: 's.variant' } },
    measures: { nombre: { label: 'Envoyés', expr: 'count(*)' }, ouverture: { label: "Taux d'ouverture (%)", expr: 'round(100.0 * count(s.opened_at) / nullif(count(*), 0))' }, clic: { label: 'Taux de clic (%)', expr: 'round(100.0 * count(s.clicked_at) / nullif(count(*), 0))' } },
  },
  partenariats: {
    label: 'Pipeline partenaires et sponsors', obj: 'crm', from: 'crm_deal d join crm_org o on o.id = d.org_id', date: 'd.created_at', country: 'o.country',
    dims: { etape: { label: 'Étape', expr: 'd.stage::text' }, nature: { label: 'Nature', expr: 'd.kind' }, mois: month('d.created_at'), pays: { label: 'Pays', expr: "coalesce(o.country, '—')" } },
    measures: { nombre: count, montant: { label: 'Montant (FCFA)', expr: 'sum(coalesce(d.amount_xof, 0))' } },
  },
};

export const Spec = z.object({
  dataset: z.string().refine((d) => d in DATASETS, 'Jeu de données inconnu'),
  by: z.string(),
  measure: z.string(),
  from: z.iso.date(),
  to: z.iso.date(),
  country: z.string().length(2).nullish(),
}).refine((s) => s.by in DATASETS[s.dataset].dims && s.measure in DATASETS[s.dataset].measures, 'Regroupement ou mesure invalide');
export type Spec = z.infer<typeof Spec>;

/** Exécute un rapport. scope : pays autorisés (null = tous). Au plus 500 groupes. */
export async function runReport(s: Spec, scope: string[] | null) {
  const d = DATASETS[s.dataset];
  const conds = [sql`${sql.raw(d.date)} >= ${`${s.from}T00:00:00Z`}::timestamptz`, sql`${sql.raw(d.date)} <= ${`${s.to}T23:59:59Z`}::timestamptz`];
  if (d.where) conds.push(sql.raw(d.where));
  if (d.country && s.country) conds.push(sql`${sql.raw(d.country)} = ${s.country}`);
  if (d.country && scope) conds.push(sql`${sql.raw(d.country)} in (${sql.join((scope.length ? scope : ['--']).map((c) => sql`${c}`), sql`, `)})`);
  if (!d.country && scope) return { rows: [], scoped: true }; // jeu sans pays : rien pour une portée limitée
  const q = sql`select ${sql.raw(d.dims[s.by].expr)} as k, ${sql.raw(d.measures[s.measure].expr)} as v from ${sql.raw(d.from)} where ${sql.join(conds, sql` and `)} group by 1 order by 1 limit 500`;
  const res = await db.execute(q);
  return { rows: (res.rows as { k: string | null; v: string | number | null }[]).map((r) => ({ k: r.k ?? '—', v: r.v == null ? 0 : Number(r.v) })), scoped: false };
}
