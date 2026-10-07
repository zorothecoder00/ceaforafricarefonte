/* CEA OS — pilotage (prototype : OKR en cascade, revue des droits, processus, compétences des entretiens annuels). */
import { asc, desc } from 'drizzle-orm';
import { db } from '../db';
import { osOkr, osReview, osFlow } from '../../db/schema/os';

export type Okr = typeof osOkr.$inferSelect;
/** Avancement d'un objectif : le sien s'il n'a pas d'enfant, sinon la moyenne de ses enfants. */
export function okrProg(o: Okr, all: Okr[]): number {
  const ch = all.filter((x) => x.parentId === o.id);
  return ch.length ? Math.round(ch.reduce((a, c) => a + okrProg(c, all), 0) / ch.length) : o.progress;
}
export const allOkrs = () => db.select().from(osOkr).orderBy(asc(osOkr.createdAt));

/** Trimestre courant : « 2026-T4 ». */
export const quarterOf = (d = new Date()) => `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
/** Revue des droits en cours (la plus récente), créée au besoin pour le trimestre. */
export async function currentReview() {
  const [r] = await db.select().from(osReview).orderBy(desc(osReview.start)).limit(1);
  if (r) return r;
  const [n] = await db.insert(osReview).values({ quarter: quarterOf() }).onConflictDoNothing().returning();
  return n ?? (await db.select().from(osReview).orderBy(desc(osReview.start)).limit(1))[0];
}

/** Processus par défaut (prototype), créés au premier affichage. */
const FLOWS: [string, string[], boolean][] = [
  ["Inscription d'un membre", ['Réception de la demande', 'Dédoublonnage', 'Validation bureau pays (48 h)', 'Routage départements', 'Carte de membre'], true],
  ['Dépense', ['Demande', 'Bureau pays', 'Région (> seuil pays)', 'Direction générale (> seuil régional)', 'Finance — paiement'], true],
  ['Congé', ['Demande', 'Manager', 'RH', 'Agenda'], true],
  ['Note de frais', ['Demande avec justificatif', 'Manager', 'Finance — remboursement'], true],
  ["Demande d'achat", ['Demande', 'Manager', 'Direction générale (> seuil)', 'Bon de commande', 'Réception', 'Facture fournisseur'], true],
  ['Situation de travaux BTP', ['Métré', 'Calcul', 'Facture', 'Relance'], true],
  ['Relance des factures en retard', ['J+7 e-mail', 'J+15 WhatsApp', 'J+30 alerte'], false],
];
export async function allFlows() {
  let rows = await db.select().from(osFlow).orderBy(asc(osFlow.position));
  if (!rows.length) {
    await db.insert(osFlow).values(FLOWS.map(([name, steps, active], i) => ({ name, steps, active, position: i }))).onConflictDoNothing();
    rows = await db.select().from(osFlow).orderBy(asc(osFlow.position));
  }
  return rows;
}

/** Compétences communes évaluées à l'entretien annuel (1 à 4). */
export const COMPS = ["Sens de l'entrepreneur", 'Intégrité et confidentialité', 'Coopération panafricaine', 'Orientation résultats', 'Maîtrise de CEA OS', 'Communication', 'Apprentissage'];
