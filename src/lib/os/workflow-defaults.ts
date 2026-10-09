/* CEA OS — configuration par défaut du moteur de workflow : circuits V01 à V16 (annexe A du cahier des charges CEA OS) et types
   de dossiers. Insérée en base au premier usage puis modifiable dans Processus et seuils (WFL-03) ; le code ne sert que de
   point de départ. Les circuits des demandes existantes (dépense, note de frais, achat, congé, contrat, recrutement, offre hors
   fourchette) gardent les règles du prototype, rattachées à leur famille V04, V01, V05 ou V06. ◊ = complément proposé (PO-15). */
import type { Circuit, WfType } from './workflow-core';

const c = (code: string, family: string, name: string, steps: Circuit['steps'], escalade: string, origin: Circuit['origin'] = 'referentiel'): Circuit =>
  ({ code, family, name, steps, escalade, origin, active: true, version: 1 });

export const DEFAULT_CIRCUITS: Circuit[] = [
  c('V01', 'V01', 'Tâche courante', [{ l: 'manager', sla: 48 }], 'SLA ou risque'),
  c('V01-CONGE', 'V01', 'Congé', [{ l: 'manager', sla: 48 }, { l: 'rh', sla: 48 }], 'SLA'),
  c('V02', 'V02', 'Document interne', [{ l: 'manager', sla: 72 }, { l: 'dg', if: ['strategic', 'sensitive'], sla: 72 }], 'Confidentialité ou portée'),
  c('V03', 'V03', 'Publication', [{ l: 'chef', sla: 48 }, { l: 'com', sla: 48 }, { l: 'dg', if: ['sensitive', 'strategic'], sla: 48 }], 'Réputation'),
  c('V04', 'V04', 'Dépense', [{ l: 'pays', sla: 48 }, { l: 'reg', if: ['amount>pays'], sla: 48 }, { l: 'dg', if: ['amount>reg'], sla: 72 }, { l: 'fin', sla: 48 }], 'Montant ou exception'),
  c('V04-NDF', 'V04', 'Note de frais', [{ l: 'manager', sla: 48 }, { l: 'fin', sla: 72 }], 'Montant ou exception'),
  c('V04-ACH', 'V04', "Demande d'achat", [{ l: 'manager', sla: 48 }, { l: 'dg', if: ['amount>reg'], sla: 72 }, { l: 'fin', sla: 48 }], 'Montant ou exception'),
  c('V05', 'V05', 'Contrat', [{ l: 'jur', sla: 72 }, { l: 'dg', if: ['amount>contrat'], sla: 72 }], 'Engagement juridique ou financier'),
  c('V06', 'V06', 'Recrutement', [{ l: 'reg', if: ['agent'], sla: 72 }, { l: 'dg', if: ['cadre'], sla: 72 }, { l: 'rh', sla: 48 }], 'Poste stratégique'),
  c('V06-OFFRE', 'V06', 'Offre hors fourchette', [{ l: 'dg', sla: 48 }], 'Poste stratégique'),
  c('V07', 'V07', 'Projet pays', [{ l: 'chef', sla: 72 }, { l: 'pays', sla: 72 }, { l: 'reg', if: ['amount>pays', 'risk'], sla: 72 }], 'Multi-pays, montant ou risque'),
  c('V08', 'V08', 'Projet régional', [{ l: 'pays', sla: 72 }, { l: 'reg', sla: 72 }, { l: 'dg', sla: 96 }], 'Portée inter-pays'),
  c('V09', 'V09', 'Projet panafricain', [{ l: 'chef', sla: 72 }, { l: 'dg', sla: 96 }, { l: 'bp', if: ['strategic', 'amount>dg'], sla: 168 }], 'Décision stratégique'),
  c('V10', 'V10', 'Investissement', [{ l: 'chef', sla: 72 }, { l: 'conf', sla: 72 }, { l: 'ci', sla: 168 }, { l: 'dg', if: ['amount>dg', 'risk'], sla: 96 }], 'Montant ou risque'),
  c('V11', 'V11', 'Partenariat stratégique', [{ l: 'chef', sla: 72 }, { l: 'pays', sla: 72 }, { l: 'dg', sla: 96 }, { l: 'bp', if: ['strategic'], sla: 168 }], 'Engagement institutionnel'),
  c('V12', 'V12', 'Changement système critique', [{ l: 'it', sla: 48 }, { l: 'conf', if: ['sensitive', 'risk'], sla: 48 }, { l: 'dg', if: ['risk'], sla: 72 }], 'Production ou sécurité'),
  c('V13', 'V13', 'Audit', [{ l: 'conf', sla: 72 }, { l: 'dg', sla: 96 }], 'Anomalie critique'),
  c('V14', 'V14', 'Événement ◊', [{ l: 'chef', sla: 48 }, { l: 'fin', if: ['budget'], sla: 48 }, { l: 'pays', sla: 48 }, { l: 'reg', if: ['amount>pays'], sla: 72 }, { l: 'dg', if: ['amount>reg'], sla: 72 }], 'Multi-pays, budget, risque, confidentialité', 'propose'),
  c('V15', 'V15', 'Cohorte ◊', [{ l: 'chef', sla: 48 }, { l: 'fin', if: ['budget'], sla: 48 }, { l: 'pays', sla: 48 }, { l: 'reg', if: ['amount>pays'], sla: 72 }, { l: 'dg', if: ['amount>reg'], sla: 72 }], 'Multi-pays, budget', 'propose'),
  c('V16', 'V16', 'Sélection ◊', [{ l: 'cs', sla: 120 }, { l: 'chef', sla: 48 }], "Conflit d'intérêts, contestation", 'propose'),
];

const PROJ = ['entree', 'qualification', 'planification', 'validation', 'execution', 'mesure', 'cloture', 'capitalisation'] as WfType['phases'];
const LEG = ['validation', 'execution', 'cloture'] as WfType['phases'];
const t = (code: string, label: string, circuit: string, prefix: string, o: Partial<WfType> = {}): WfType => ({
  code, label, circuit, prefix, phases: o.phases ?? ['entree', 'validation', 'execution', 'cloture'], checklist: o.checklist ?? [], rejectTo: o.rejectTo ?? 'corrige',
  exec: o.exec ?? [], sla: o.sla ?? 48, dueDays: o.dueDays ?? 30, active: true, generic: o.generic ?? true,
});
const piece = (k: string, label: string, critical = true) => ({ k, label, critical });

export const DEFAULT_TYPES: WfType[] = [
  // Demandes existantes (formulaires dédiés de l'accueil, des RH et des domaines)
  t('dep', 'Dépense', 'V04', 'DEP-', { phases: LEG, generic: false, rejectTo: 'clos', checklist: [piece('justificatif', 'Justificatif (facture, devis)', false)] }),
  t('ndf', 'Note de frais', 'V04-NDF', 'NDF-', { phases: LEG, generic: false, rejectTo: 'clos', checklist: [piece('justificatif', 'Photo du justificatif')] }),
  t('conge', 'Congé', 'V01-CONGE', 'CONG-', { phases: LEG, generic: false, rejectTo: 'clos' }),
  t('achat', "Demande d'achat", 'V04-ACH', 'DA-', { phases: LEG, generic: false, rejectTo: 'clos' }),
  t('contrat', 'Contrat', 'V05', 'CTRA-', { phases: LEG, generic: false, rejectTo: 'clos' }),
  t('recrut', 'Recrutement', 'V06', 'RECR-', { phases: LEG, generic: false, rejectTo: 'clos' }),
  t('offre', 'Offre hors fourchette', 'V06-OFFRE', 'OFR-', { phases: LEG, generic: false, rejectTo: 'clos' }),
  // Dossiers génériques (Dossiers et validations › Nouveau dossier)
  t('tache', 'Tâche ou demande courante', 'V01', 'TCH-', { phases: ['entree', 'production', 'validation', 'execution', 'cloture'], dueDays: 14 }),
  t('doc', 'Document interne à valider', 'V02', 'DOC-', { phases: ['production', 'controle', 'validation', 'cloture'], checklist: [piece('document', 'Document (version à valider)')], dueDays: 15 }),
  t('pub', 'Publication', 'V03', 'PUB-', { phases: ['production', 'controle', 'validation', 'execution', 'cloture'], checklist: [piece('contenu', 'Contenu à publier')], exec: [{ title: 'Publier et diffuser', days: 3 }], dueDays: 10 }),
  t('projet_pays', 'Projet pays', 'V07', 'PRJ-', { phases: PROJ, checklist: [piece('note', 'Note conceptuelle'), piece('budget', 'Budget prévisionnel'), piece('cadre', 'Cadre logique', false)], exec: [{ title: "Constituer l'équipe projet", days: 7 }, { title: 'Établir le plan projet (jalons, livrables, RACI)', days: 14 }, { title: 'Ouvrir le registre des risques', days: 14 }], dueDays: 90 }),
  t('projet_reg', 'Projet régional', 'V08', 'PRJ-', { phases: PROJ, checklist: [piece('note', 'Note conceptuelle'), piece('budget', 'Budget prévisionnel'), piece('cadre', 'Cadre logique', false)], exec: [{ title: "Constituer l'équipe projet", days: 7 }, { title: 'Établir le plan projet (jalons, livrables, RACI)', days: 14 }, { title: 'Ouvrir le registre des risques', days: 14 }], dueDays: 120 }),
  t('projet_pan', 'Projet panafricain', 'V09', 'PRJ-', { phases: PROJ, checklist: [piece('note', 'Note conceptuelle'), piece('budget', 'Budget prévisionnel'), piece('cadre', 'Cadre logique')], exec: [{ title: "Constituer l'équipe projet", days: 7 }, { title: 'Établir le plan projet (jalons, livrables, RACI)', days: 14 }, { title: 'Ouvrir le registre des risques', days: 14 }], dueDays: 180 }),
  t('invest', 'Investissement', 'V10', 'INV-', { phases: ['entree', 'qualification', 'controle', 'validation', 'execution', 'mesure', 'cloture'], checklist: [piece('memo', "Mémo d'investissement"), piece('kyc', 'KYC conforme'), piece('dd', 'Rapport de due diligence', false)], exec: [{ title: 'Suivre la checklist de closing', days: 30 }], dueDays: 90 }),
  t('partenariat', 'Partenariat stratégique', 'V11', 'PAR-', { phases: ['entree', 'qualification', 'validation', 'execution', 'mesure', 'cloture'], checklist: [piece('projet', "Projet d'accord")], exec: [{ title: 'Signer et archiver la convention', days: 15 }, { title: 'Planifier le premier comité de suivi', days: 30 }], dueDays: 60 }),
  t('changement', 'Changement de système critique', 'V12', 'CHG-', { phases: ['entree', 'planification', 'validation', 'execution', 'controle', 'cloture'], checklist: [piece('plan', 'Plan de changement et de retour arrière')], exec: [{ title: 'Mettre en production et vérifier', days: 7 }], dueDays: 21 }),
  t('audit', 'Mission d’audit', 'V13', 'AUD-', { phases: ['planification', 'production', 'controle', 'validation', 'execution', 'cloture'], checklist: [piece('rapport', "Rapport d'audit"), piece('reponse', 'Réponse du contrôlé', false)], exec: [{ title: 'Suivre le plan d’actions correctives', days: 30 }], dueDays: 60 }),
  t('evenement', 'Événement ◊', 'V14', 'EVT-', { phases: ['entree', 'planification', 'validation', 'execution', 'mesure', 'cloture'], checklist: [piece('brief', 'Event brief (objectifs, public, format, dates, lieu, budget)')], exec: [{ title: 'Ouvrir les inscriptions', days: 7 }, { title: 'Confirmer les intervenants', days: 14 }, { title: 'Organiser la logistique', days: 21 }, { title: 'Lancer la communication', days: 7 }], dueDays: 60 }),
  t('cohorte', 'Cohorte ◊', 'V15', 'COH-', { phases: ['entree', 'planification', 'validation', 'execution', 'mesure', 'cloture'], checklist: [piece('programme', 'Programme et calendrier'), piece('budget', 'Budget', false)], exec: [{ title: "Publier l'appel à candidatures", days: 7 }, { title: 'Constituer le comité de sélection', days: 14 }], dueDays: 90 }),
  t('selection', 'Liste de sélection ◊', 'V16', 'SEL-', { phases: ['production', 'controle', 'validation', 'cloture'], checklist: [piece('grille', "Grille d'évaluation et classement"), piece('conflits', "Déclarations de conflits d'intérêts")], dueDays: 15 }),
];

const NAMES = new Map(DEFAULT_TYPES.map((x) => [x.code, x.label]));
/** Libellé d'un type de dossier (les libellés ne se modifient pas en administration). */
export const typeName = (code: string) => NAMES.get(code) ?? code;
