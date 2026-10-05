/* Libellés du CRM 360° (CDC §12), partagés par l'API et les pages du back-office. */
import type { crmDealStageEnum, crmOrgKindEnum } from '../db/schema/crm';

export type Stage = (typeof crmDealStageEnum.enumValues)[number];
export const STAGES: Stage[] = ['prospect', 'contact', 'proposition', 'negociation', 'gagne', 'perdu'];
export const STAGE_LABEL: Record<Stage, string> = { prospect: 'Prospect', contact: 'Premier contact', proposition: 'Proposition envoyée', negociation: 'Négociation', gagne: 'Gagné', perdu: 'Perdu' };
export const ORG_KIND_LABEL: Record<(typeof crmOrgKindEnum.enumValues)[number], string> = {
  entreprise: 'Entreprise', bailleur: 'Bailleur de fonds', banque: 'Banque', fondation: 'Fondation', institution: 'Institution publique',
  media: 'Média', universite: 'Université', association: 'Association', autre: 'Autre',
};
export const INTERACTION_LABEL: Record<string, string> = { appel: 'Appel', reunion: 'Réunion', email: 'E-mail', note: 'Note', evenement: 'Événement' };
export const DEAL_KIND_LABEL: Record<string, string> = { partenariat: 'Partenariat', sponsoring: 'Sponsoring', subvention: 'Subvention' };

/** Clé d'une fiche 360° dans l'URL : u-<membre> ou c-<contact externe>. */
export const personKey = (k: string) => k.replace(':', '-');
