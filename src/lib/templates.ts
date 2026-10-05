/* Modèles de messages (CDC §12, paramétrage) : textes des notifications modifiables sans développeur.
   Chaque modèle a un texte par défaut et des variables entre accolades ({reference}, {programme}…) ; une variable inconnue reste vide.
   Les textes personnalisés sont lus en base (cache 60 s). */
import { db } from './db';
import { messageTemplate } from '../db/schema/finance';

export const TEMPLATES = {
  'candidature.recue': { label: 'Candidature reçue', vars: ['reference', 'programme'], body: 'Candidature {reference} reçue : {programme}. Prochaine étape : diagnostic de maturité.' },
  'candidature.entretien': { label: 'Candidature — entretien', vars: ['reference'], body: 'Votre candidature {reference} : vous êtes invité·e à un entretien.' },
  'candidature.admise': { label: 'Candidature admise', vars: ['reference'], body: 'Votre candidature {reference} est acceptée. Félicitations !' },
  'candidature.liste_attente': { label: "Candidature sur liste d'attente", vars: ['reference'], body: 'Votre candidature {reference} est sur liste d’attente.' },
  'candidature.refusee': { label: 'Candidature non retenue', vars: ['reference'], body: 'Votre candidature {reference} n’a pas été retenue cette fois. Merci pour votre candidature.' },
  'jury.ajout': { label: 'Ajout à un jury', vars: ['appel'], body: 'Vous êtes membre du jury : {appel}. Les dossiers à évaluer sont dans votre espace.' },
  'cohorte.bienvenue': { label: 'Bienvenue dans une cohorte', vars: ['cohorte'], body: 'Bienvenue dans la cohorte « {cohorte} ». Votre programme, vos séances et vos jalons sont dans votre espace.' },
  'adhesion.activee': { label: 'Adhésion activée', vars: ['carte'], body: 'Adhésion activée — carte n° {carte}' },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

let cache: { at: number; map: Map<string, string> } | undefined;
export const invalidateTemplates = () => { cache = undefined; };
async function overrides() {
  if (cache && Date.now() - cache.at < 60_000) return cache.map;
  const rows = await db.select({ key: messageTemplate.key, body: messageTemplate.body }).from(messageTemplate).catch(() => []);
  cache = { at: Date.now(), map: new Map(rows.map((r) => [r.key, r.body])) };
  return cache.map;
}

/** Remplit un gabarit : {nom} → valeur ; les accolades sans variable connue disparaissent. */
export const fill = (body: string, vars: Record<string, string | number>) => body.replace(/\{([a-z_]+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));

/** Texte d'un message : modèle personnalisé s'il existe, sinon texte par défaut. */
export async function message(key: TemplateKey, vars: Record<string, string | number>) {
  const body = (await overrides()).get(key) ?? TEMPLATES[key].body;
  return fill(body, vars);
}
