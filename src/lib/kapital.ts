/* Règles métier de CEA KAPITAL INVEST (CDC §8) : pipeline des dossiers, interrupteurs réglementaires par pays, accès gradué. */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import * as s from '../db/schema';

export type DossierStatus = (typeof s.dossierStatusEnum.enumValues)[number];

/** Pipeline (CDC §8.3) avec libellés et délais cibles (SLA, en jours ouvrés). */
export const PIPELINE: { key: DossierStatus; label: string; sla: number }[] = [
  { key: 'recu', label: 'Reçu', sla: 2 },
  { key: 'incomplet', label: 'Incomplet', sla: 10 },
  { key: 'preselectionne', label: 'Présélectionné', sla: 5 },
  { key: 'diagnostic', label: 'Diagnostic', sla: 10 },
  { key: 'en_preparation', label: 'En préparation', sla: 30 },
  { key: 'revue_analyste', label: "Revue par l'analyste", sla: 10 },
  { key: 'comite', label: 'Comité', sla: 15 },
  { key: 'pret_presentation', label: 'Prêt pour présentation', sla: 30 },
  { key: 'mis_en_relation', label: 'Mis en relation', sla: 60 },
  { key: 'finance', label: 'Financé', sla: 0 },
  { key: 'cloture', label: 'Clôturé', sla: 0 },
];
export const statusLabel = (k: string) => PIPELINE.find((p) => p.key === k)?.label ?? k;

export const INSTRUMENTS: Record<string, (typeof s.instrumentEnum.enumValues)[number]> = {
  'Actions ordinaires': 'actions_ordinaires', 'Actions de préférence': 'actions_preference', 'SAFE / BSA AIR': 'safe_bsa_air',
  'Obligations convertibles': 'obligations_convertibles', 'Dette privée': 'dette_privee', Mezzanine: 'mezzanine', 'Financement islamique': 'financement_islamique', Subvention: 'subvention',
};
export const INSTRUMENT_LABEL = Object.fromEntries(Object.entries(INSTRUMENTS).map(([k, v]) => [v, k])) as Record<string, string>;

/** Fonctions réglementées (CDC §8.11). */
export const FEATURES: [string, string][] = [
  ['kap_intro', 'Mise en relation privée avec des investisseurs qualifiés (niveau 2)'],
  ['kap_sub', 'Souscriptions et syndicats via partenaire agréé (niveau 3)'],
  ['kap_sec', 'Marché secondaire des titres non cotés (niveau 3)'],
  ['kap_pop', 'Actionnariat populaire / offre au public (niveau 3–4)'],
  ['kap_lp', 'Fonds et portail des souscripteurs (niveau 4)'],
  ['kap_ord', 'Ordres de bourse via SGI partenaire (niveau 3)'],
  ['vote', 'Vote électronique en assemblée (droit OHADA)'],
];

/** Une fonction réglementée est-elle ouverte dans ce pays ? Fermée par défaut. */
export async function isOpen(feature: string, country = 'TG') {
  const [f] = await db.select({ on: s.featureFlag.enabled }).from(s.featureFlag).where(and(eq(s.featureFlag.country, country), eq(s.featureFlag.feature, feature)));
  return !!f?.on;
}

export const VERIF_LABEL: Record<string, string> = { verifie: 'Vérifié par CEA', diligence_en_cours: 'Diligence en cours', declaratif: 'Déclaratif' };

/** Opportunités publiées (résumés), au format des cartes OppCard. */
export async function listOpportunities(f: { sector?: string; stage?: string; country?: string; verification?: string; limit?: number } = {}) {
  const rows = await db.select({
    d: s.dossier,
    pledged: sql<number>`coalesce((select sum(${s.interest.amountXof}) from ${s.interest} where ${s.interest.dossierId} = ${s.dossier.id}), 0)::bigint`,
  }).from(s.dossier)
    .where(and(eq(s.dossier.published, true), eq(s.dossier.shareConsent, true),
      f.sector ? eq(s.dossier.sector, f.sector) : undefined, f.stage ? eq(s.dossier.stage, f.stage) : undefined,
      f.country ? eq(s.dossier.country, f.country) : undefined, f.verification ? eq(s.dossier.verification, f.verification as 'verifie') : undefined))
    .orderBy(desc(s.dossier.updatedAt)).limit(f.limit ?? 60);
  return rows.map(({ d, pledged }) => ({
    id: d.id, n: d.companyName, c: d.country, s: d.sector ?? '—', st: d.stage ?? '—', inst: d.instrument ? INSTRUMENT_LABEL[d.instrument] : '—',
    need: d.amountXof ?? 0, ver: VERIF_LABEL[d.verification], prog: d.amountXof ? Math.min(100, Math.round((Number(pledged) / d.amountXof) * 100)) : 0,
    tr: d.traction, use: d.useOfFunds, team: d.team, ref: d.reference, status: d.status,
  }));
}

/** L'utilisateur est-il un investisseur vérifié (KYC validé) ? */
export async function isVerifiedInvestor(userId: string) {
  const [p] = await db.select({ st: s.investorProfile.kycStatus }).from(s.investorProfile).where(eq(s.investorProfile.userId, userId));
  return p?.st === 'verifie';
}

/** Accès gradué à un dossier (CDC §8.9) : résumé → (NDA) → data room. */
export async function accessLevel(userId: string | undefined, dossierId: string): Promise<'aucun' | 'resume' | 'dataroom' | 'proprietaire' | 'equipe'> {
  if (!userId) return 'resume';
  const [d] = await db.select({ owner: s.dossier.ownerId, analyst: s.dossier.analystId }).from(s.dossier).where(eq(s.dossier.id, dossierId));
  if (!d) return 'aucun';
  if (d.owner === userId) return 'proprietaire';
  const roles = (await db.select({ r: s.userRole.role }).from(s.userRole).where(eq(s.userRole.userId, userId))).map((x) => x.r);
  if (roles.some((r) => ['analyste', 'comite', 'conformite', 'admin', 'direction'].includes(r))) return 'equipe';
  if (!(await isVerifiedInvestor(userId))) return 'resume';
  const [nda] = await db.select().from(s.nda).where(and(eq(s.nda.dossierId, dossierId), eq(s.nda.investorId, userId), isNull(s.nda.revokedAt)));
  return nda ? 'dataroom' : 'resume';
}
