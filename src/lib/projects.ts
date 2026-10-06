/* Project Studio (CDC §7.2) : droits d'accès, fiche normalisée, maturité sur 8 dimensions, modèle financier guidé. */
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { project, projectMember } from '../db/schema/app';
import { hasRole } from './rbac';
import type { CurrentUser } from './session';

export const SHEET_FIELDS: [string, string, string][] = [
  ['probleme', 'Problème', 'Quel problème résolvez-vous, pour qui, et quelle est son ampleur ?'],
  ['solution', 'Solution', 'Votre produit ou service, et en quoi il est meilleur que les alternatives.'],
  ['marche', 'Marché', 'Taille du marché (avec sources), clients cibles, concurrence.'],
  ['equipe', 'Équipe', 'Fondateurs, compétences clés, recrutements prévus.'],
  ['modele', 'Modèle économique', 'Comment vous gagnez de l’argent : prix, coûts, marge par client.'],
  ['traction', 'Traction', 'Clients, chiffre d’affaires, croissance, partenariats.'],
  ['besoins', 'Besoins', 'Financement, compétences, partenaires recherchés.'],
  ['impact', 'Impact', 'Emplois, environnement, inclusion : indicateurs suivis.'],
];

export const PROJECT_SECTORS = ['Agriculture', 'Agro-industrie', 'Énergie', 'Santé', 'Éducation', 'Numérique', 'Fintech', 'BTP', 'Industrie', 'Commerce', 'Autre'];
export const PROJECT_STAGES = ['Idée', 'Pré-amorçage', 'Amorçage', 'Croissance', 'Série A'];
export const PROJECT_STATUS: Record<string, string> = { brouillon: 'Brouillon', soumis: 'Soumis', en_structuration: 'En structuration', pret_investissement: "Prêt pour l'investissement", transmis_kapital: 'Transmis à Kapital', finance: 'Financé', archive: 'Archivé' };

export const DIMENSIONS: [string, string][] = [
  ['equipe', 'Équipe'], ['marche', 'Marché'], ['produit', 'Produit'], ['traction', 'Traction'],
  ['modele', 'Modèle'], ['finances', 'Finances'], ['gouvernance', 'Gouvernance'], ['impact', 'Impact'],
];

export const CANVAS: Record<string, { label: string; blocks: [string, string][] }> = {
  bmc: { label: 'Business Model Canvas', blocks: [['partenaires', 'Partenaires clés'], ['activites', 'Activités clés'], ['ressources', 'Ressources clés'], ['proposition', 'Proposition de valeur'], ['relation', 'Relation client'], ['canaux', 'Canaux'], ['segments', 'Segments de clients'], ['couts', 'Structure de coûts'], ['revenus', 'Sources de revenus']] },
  lean: { label: 'Lean Canvas', blocks: [['probleme', 'Problème'], ['solution', 'Solution'], ['indicateurs', 'Indicateurs clés'], ['proposition', 'Proposition unique'], ['avantage', 'Avantage déloyal'], ['canaux', 'Canaux'], ['segments', 'Segments'], ['couts', 'Coûts'], ['revenus', 'Revenus']] },
  swot: { label: 'Analyse SWOT', blocks: [['forces', 'Forces'], ['faiblesses', 'Faiblesses'], ['opportunites', 'Opportunités'], ['menaces', 'Menaces']] },
  arbre_problemes: { label: 'Arbre à problèmes', blocks: [['causes', 'Causes'], ['probleme', 'Problème central'], ['effets', 'Effets']] },
  cadre_logique: { label: 'Cadre logique', blocks: [['objectif', 'Objectif global'], ['specifique', 'Objectif spécifique'], ['resultats', 'Résultats attendus'], ['activites', 'Activités'], ['indicateurs', 'Indicateurs vérifiables'], ['sources', 'Sources de vérification'], ['hypotheses', 'Hypothèses et risques']] },
  theorie_changement: { label: 'Théorie du changement', blocks: [['intrants', 'Intrants'], ['activites', 'Activités'], ['produits', 'Produits'], ['effets', 'Effets'], ['impact', 'Impact']] },
};

export type ProjectRole = 'proprietaire' | 'membre' | 'expert' | 'partenaire' | 'equipe' | null;

export async function projectRole(user: CurrentUser | null | undefined, projectId: string): Promise<ProjectRole> {
  if (!user) return null;
  const [p] = await db.select({ owner: project.ownerId }).from(project).where(eq(project.id, projectId));
  if (!p) return null;
  if (p.owner === user.id) return 'proprietaire';
  const [m] = await db.select({ role: projectMember.role }).from(projectMember).where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, user.id)));
  if (m) return m.role as ProjectRole;
  if (hasRole(user.roles, 'charge_programme', 'admin')) return 'equipe';
  return null;
}
export const canEdit = (r: ProjectRole) => r === 'proprietaire' || r === 'membre';
export const canComment = (r: ProjectRole) => !!r && r !== 'partenaire';

/** Score de maturité : auto-évaluation (0-5) par dimension → score sur 100. */
export function maturityScore(m: Record<string, number>) {
  const vals = DIMENSIONS.map(([k]) => Math.max(0, Math.min(5, Number(m[k] ?? 0))));
  return Math.round((vals.reduce((a, b) => a + b, 0) / (DIMENSIONS.length * 5)) * 100);
}

export { financeModel, DEFAULT_FINANCE, type FinanceInputs } from './finance';
