/* CEA OS — référentiels du progiciel de gestion interne (prototype CEA OS) : régions et pays du réseau, domaines
   d'intervention (code court, couleur), profils d'accès, grades et fourchettes de salaire, postes du référentiel,
   séparation des tâches, libellés des circuits d'approbation et des statuts. Module sans base : utilisable partout. */
import { REF, type Poste } from '../../data/postes';

export { REF, type Poste };

/** Régions et ville du bureau régional. */
export const REGIONS = {
  AO: { n: "Afrique de l'Ouest", city: 'Lomé' },
  AC: { n: 'Afrique centrale', city: 'Douala' },
  AE: { n: "Afrique de l'Est", city: 'Nairobi' },
  AA: { n: 'Afrique australe', city: 'Johannesburg' },
  AN: { n: 'Afrique du Nord', city: 'Casablanca' },
} as const;
export type Region = keyof typeof REGIONS;

/** Pays du réseau : nom, région, devise. */
export const PAYS: Record<string, [string, Region, string]> = {
  TG: ['Togo', 'AO', 'XOF'], CI: ["Côte d'Ivoire", 'AO', 'XOF'], SN: ['Sénégal', 'AO', 'XOF'], BJ: ['Bénin', 'AO', 'XOF'], NG: ['Nigeria', 'AO', 'NGN'],
  GH: ['Ghana', 'AO', 'GHS'], ML: ['Mali', 'AO', 'XOF'], BF: ['Burkina Faso', 'AO', 'XOF'], CM: ['Cameroun', 'AC', 'XAF'], CD: ['RD Congo', 'AC', 'CDF'],
  GA: ['Gabon', 'AC', 'XAF'], KE: ['Kenya', 'AE', 'KES'], RW: ['Rwanda', 'AE', 'RWF'], ET: ['Éthiopie', 'AE', 'ETB'], ZA: ['Afrique du Sud', 'AA', 'ZAR'],
  MA: ['Maroc', 'AN', 'MAD'], EG: ['Égypte', 'AN', 'EGP'],
};
export const PK = Object.keys(PAYS);
export const pn = (c: string | null | undefined) => (c && PAYS[c] ? PAYS[c][0] : c ?? '—');
export const regOf = (c: string | null | undefined): Region | null => (c && PAYS[c] ? PAYS[c][1] : null);

/** Domaines d'intervention : nom, domaine, couleur ; site = identifiant du domaine sur le site public. */
export const DOM = {
  act: { n: 'CEA Actionnariat', d: 'Actionnariat', c: '#5B8DB8', site: 'actionnariat' },
  kap: { n: 'CEA Kapital Invest', d: 'Levée de fonds', c: '#C9962B', site: 'levee' },
  prj: { n: 'CEA Project Studio', d: 'Développement de projets', c: '#3E7C6B', site: 'projets' },
  evt: { n: 'CEA Events', d: 'Événements', c: '#8E5BB8', site: 'evenements' },
  tal: { n: 'CEA Talents', d: "Création d'emplois", c: '#2B8DA8', site: 'emploi' },
  mm: { n: 'CEA Mastermind Circles', d: 'Mastermind group', c: '#6B6F2B', site: 'mastermind' },
  aca: { n: 'CEA Academy & Accelerator', d: 'Accompagnement et formation', c: '#2E5CA8', site: 'formation' },
  voix: { n: 'CEA Voix des Entrepreneurs', d: 'Action syndicale', c: '#A84A5B', site: 'syndicat' },
  btp: { n: 'CEA BTP & Infrastructures', d: 'BTP et infrastructures', c: '#B8662B', site: 'btp' },
} as const;
export type Dom = keyof typeof DOM;
export const DK = Object.keys(DOM) as Dom[];
export const isDom = (d: unknown): d is Dom => typeof d === 'string' && d in DOM;

/** Profils d'accès internes : ils découlent du poste occupé. */
export const PROF = {
  dg: 'Direction générale', adg: 'Assistance de direction', ops: 'Opérations', fin: 'Finance', rh: 'Ressources humaines', jur: 'Juridique',
  conf: 'Conformité', com: 'Communication', it: 'Informatique', chef: 'Chef de département', analyste: 'Analyste', dirreg: 'Directeur régional',
  rep: 'Représentant pays', cond: 'Conducteur de travaux', agent: 'Agent / chargé',
} as const;
export type Prof = keyof typeof PROF;

export const GRADES = ['Direction', 'Cadre supérieur', 'Cadre', 'Agent de maîtrise', 'Agent'] as const;
/** Fourchettes de salaire brut mensuel par grade (FCFA). */
export const BANDS: Record<string, [number, number]> = {
  Direction: [3000000, 99e9], 'Cadre supérieur': [1500000, 2800000], Cadre: [800000, 1500000], 'Agent de maîtrise': [400000, 750000], Agent: [200000, 400000],
};

const REFM = new Map(REF.map((r) => [r.c, r]));
export const poste = (c: string | null | undefined) => (c ? REFM.get(c) : undefined);
export const refT = (c: string | null | undefined) => poste(c)?.t ?? c ?? '—';
export const gradeOf = (c: string) => {
  const g = poste(c)?.g ?? 'Cadre';
  return Object.keys(BANDS).sort((a, b) => b.length - a.length).find((k) => g.startsWith(k)) ?? 'Cadre';
};
/** Domaine rattaché à un poste. */
export const PDOM: Record<string, Dom> = {
  C1: 'act', C2: 'kap', C3: 'kap', C4: 'kap', C5: 'kap', C6: 'prj', C7: 'prj', C8: 'evt', C9: 'evt', C10: 'tal', C11: 'tal', C12: 'mm', C13: 'mm',
  C14: 'aca', C15: 'aca', C16: 'aca', C17: 'voix', C18: 'voix', C19: 'btp', C20: 'btp', C21: 'btp', C22: 'btp', C23: 'prj', C24: 'prj', B3: 'voix', B4: 'prj',
};
/** Profil d'accès d'un poste. */
export function profOf(c: string): Prof {
  const m: Record<string, Prof> = {
    A1: 'dg', A2: 'adg', A3: 'ops', A4: 'ops', A5: 'rh', A6: 'jur', A7: 'conf', C4: 'conf', E11: 'conf', E12: 'conf', B1: 'dirreg', B2: 'rep',
    C3: 'analyste', C5: 'analyste', C21: 'cond', C22: 'cond', E1: 'ops', E2: 'ops', E3: 'ops', E4: 'ops', E13: 'ops', E14: 'ops',
    F1: 'com', F2: 'com', F3: 'com', F4: 'com', F5: 'com',
  };
  if (m[c]) return m[c];
  if (['C1', 'C2', 'C6', 'C8', 'C10', 'C12', 'C14', 'C17', 'C19'].includes(c)) return 'chef';
  if (c[0] === 'D') return Number(c.slice(1)) <= 5 ? 'fin' : 'it';
  if (c[0] === 'E') return 'it';
  return 'agent';
}
/** Cumuls interdits (séparation des tâches). */
export const SOD: [string, string, string][] = [['C3', 'C4', 'Analyste Kapital et conformité Kapital'], ['D3', 'D5', 'Trésorerie et achats'], ['D5', 'D2', 'Achats et comptabilité']];

/** Niveaux des circuits d'approbation. */
export const LVL = { manager: 'Responsable hiérarchique', pays: 'Représentant pays', reg: 'Directeur régional', dg: 'Direction générale', fin: 'Finance', rh: 'Ressources humaines', jur: 'Juridique' } as const;
export type Level = keyof typeof LVL;
/** Types de demandes soumises à approbation. */
export const RTYPE = { dep: 'Dépense', ndf: 'Note de frais', conge: 'Congé', achat: "Demande d'achat", contrat: 'Contrat', recrut: 'Recrutement', offre: 'Offre hors fourchette' } as const;
export type ReqType = keyof typeof RTYPE;
export const RPREFIX: Record<ReqType, string> = { dep: 'DEP-', ndf: 'NDF-', conge: 'CONG-', achat: 'DA-', contrat: 'CTRA-', recrut: 'RECR-', offre: 'OFR-' };

/** Couleur des pastilles de statut (comme le prototype). */
const ST: Record<string, string> = {
  Payée: 'ok', Approuvée: 'ok', Approuvé: 'ok', Validée: 'ok', Vérifié: 'ok', Soumis: 'ok', Terminé: 'ok', Résolu: 'ok', Rapproché: 'ok', Conforme: 'ok',
  Publié: 'ok', Remboursée: 'ok', Commandée: 'info', Reçu: 'ok', Livré: 'ok', 'En vigueur': 'ok', Traité: 'ok', Actif: 'ok', 'En retard': 'bad', Rejetée: 'bad',
  'Alerte PEP': 'bad', P1: 'bad', 'Expire bientôt': 'bad', 'En approbation': 'warn', 'En attente': 'warn', 'À vérifier': 'warn', 'En relecture': 'warn',
  Ouvert: 'warn', 'Non rapproché': 'warn', 'À traiter': 'warn', 'En signature': 'warn', 'En cours': 'info', Émise: 'info', Commandé: 'info', Brouillon: '', Planifié: 'info',
};
export const stClass = (s: string) => ST[s] ?? '';

/* Formats */
export const fmt = (n: number | string | null | undefined) => Math.round(Number(n) || 0).toLocaleString('fr-FR');
export const fcfa = (n: number | string | null | undefined) => fmt(n) + ' FCFA';
export const mfcfa = (n: number) => (Math.abs(n) >= 1e9 ? (n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Md' : Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M' : fmt(n)) + ' FCFA';
export const dstr = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Africa/Lome' }) : '—');
export const dtstr = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Lome' }) : '—');
export const initials = (n: string) => String(n).split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();

/** Semaine ISO courante : « 2026-S41 ». */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-S' + Math.ceil(((t.getTime() - y.getTime()) / 864e5 + 1) / 7);
}
