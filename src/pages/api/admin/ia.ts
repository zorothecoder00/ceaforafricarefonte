/* IA au service de l'équipe CEA (CDC §11) : l'IA propose, explique et documente ; l'équipe décide.
   POST { action: 'dossier.analyse', id }  → pré-analyse d'un dossier Kapital (complétude, incohérences, synthèse, questions)
   POST { action: 'moderation', kind: 'post'|'job', id } → avis de modération (conforme, à vérifier, à retirer) avec motifs
   Chaque résultat est conservé dans ai_note (consultable ensuite sans nouvel appel) et l'appel est journalisé. */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { aiNote, job, post, profile } from '../../../db/schema/app';
import { dossier, dataRoomDocument, diagnostic, kycCheck, dossierEvent } from '../../../db/schema/kapital';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi, staffApiAll, countriesFor } from '../../../lib/admin';
import { aiEnabled, askModel, replyText } from '../../../lib/ai';
import { statusLabel, INSTRUMENT_LABEL } from '../../../lib/kapital';
import { country } from '../../../data/site';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dossier.analyse'), id: z.uuid() }),
  z.object({ action: z.literal('moderation'), kind: z.enum(['post', 'job']), id: z.uuid() }),
]);

/* ----- Pré-analyse d'un dossier Kapital ----- */
const ANALYSE_SCHEMA = {
  type: 'object',
  properties: {
    synthese: { type: 'string', description: "5 à 8 phrases pour l'analyste : activité, stade, besoin, points forts, points d'attention." },
    completude: {
      type: 'array',
      items: { type: 'object', properties: { element: { type: 'string' }, statut: { type: 'string', enum: ['complet', 'partiel', 'manquant'] }, commentaire: { type: 'string' } }, required: ['element', 'statut', 'commentaire'], additionalProperties: false },
    },
    incoherences: { type: 'array', items: { type: 'object', properties: { point: { type: 'string' }, detail: { type: 'string' } }, required: ['point', 'detail'], additionalProperties: false } },
    questions: { type: 'array', items: { type: 'string' }, description: "Questions à poser à l'entreprise." },
  },
  required: ['synthese', 'completude', 'incoherences', 'questions'],
  additionalProperties: false,
};
const Analyse = z.object({
  synthese: z.string(),
  completude: z.array(z.object({ element: z.string(), statut: z.enum(['complet', 'partiel', 'manquant']), commentaire: z.string() })),
  incoherences: z.array(z.object({ point: z.string(), detail: z.string() })),
  questions: z.array(z.string()),
});
const ANALYSE_SYSTEM = `Tu assistes les analystes de CEA Kapital Invest (plateforme panafricaine de mise en relation entre entreprises et investisseurs).
Tu fais une pré-analyse d'un dossier de levée de fonds, à partir des seules informations fournies (déclaratives tant qu'elles ne sont pas vérifiées).
Tu ne notes pas l'entreprise, tu ne recommandes ni d'investir ni de rejeter : l'analyste et le comité décident.
Complétude : passe en revue les éléments attendus d'un dossier (identité et immatriculation, secteur et stade, montant et instrument, utilisation des fonds, traction et chiffres, équipe, diagnostic de maturité, data room : statuts, états financiers, pitch deck, prévisionnel, KYB).
Incohérences : relève les contradictions ou invraisemblances entre les informations (par exemple un montant sans rapport avec la traction ou le stade, une utilisation des fonds qui ne correspond pas au besoin), en restant factuel.
Questions : 3 à 6 questions précises à poser à l'entreprise. Rédige en français.`;

async function analyseDossier(id: string) {
  const [d] = await db.select().from(dossier).where(eq(dossier.id, id));
  if (!d) return null;
  const [diag] = await db.select({ score: diagnostic.score }).from(diagnostic).where(eq(diagnostic.dossierId, id)).orderBy(desc(diagnostic.createdAt)).limit(1);
  const docs = await db.select({ folder: dataRoomDocument.folder, name: dataRoomDocument.name }).from(dataRoomDocument).where(eq(dataRoomDocument.dossierId, id));
  const kyb = await db.select({ kind: kycCheck.kind, status: kycCheck.status }).from(kycCheck).where(eq(kycCheck.dossierId, id));
  const notes = await db.select({ note: dossierEvent.note }).from(dossierEvent).where(eq(dossierEvent.dossierId, id)).orderBy(desc(dossierEvent.at)).limit(10);
  // Minimisation : ni nom ni coordonnées du porteur, seulement les informations de l'entreprise
  return [
    `Entreprise : ${d.companyName} (${country(d.country)}) — RCCM : ${d.rccm ?? 'non renseigné'}`,
    `Secteur : ${d.sector ?? 'non renseigné'} · Stade : ${d.stage ?? 'non renseigné'} · Statut du dossier : ${statusLabel(d.status)} · Vérification : ${d.verification}`,
    `Montant recherché : ${d.amountXof ? `${d.amountXof.toLocaleString('fr-FR')} FCFA` : 'non renseigné'} · Instrument : ${d.instrument ? INSTRUMENT_LABEL[d.instrument] : 'non renseigné'}`,
    `Utilisation des fonds : ${d.useOfFunds ?? 'non renseignée'}`,
    `Traction : ${d.traction ?? 'non renseignée'}`,
    `Équipe : ${d.team ?? 'non renseignée'}`,
    `Score investor-ready : ${d.investorReadyScore ?? 'aucun'} · Diagnostic de maturité : ${diag ? `${diag.score}/100` : 'non réalisé'}`,
    `Data room (${docs.length} document${docs.length > 1 ? 's' : ''}) : ${docs.map((x) => `[${x.folder}] ${x.name}`).join(' ; ') || 'vide'}`,
    `KYB : ${kyb.map((k) => `${k.kind} ${k.status}`).join(' ; ') || 'aucune vérification'}`,
    `Notes de suivi récentes : ${notes.map((n) => n.note).filter(Boolean).join(' | ') || 'aucune'}`,
  ].join('\n');
}

/* ----- Avis de modération ----- */
const MOTIFS = ['haine', 'harcelement', 'arnaque', 'annonce_trompeuse', 'discrimination', 'spam', 'donnees_personnelles', 'faux_profil', 'contenu_sexuel', 'violence', 'autre'] as const;
const MOD_SCHEMA = {
  type: 'object',
  properties: {
    avis: { type: 'string', enum: ['conforme', 'a_verifier', 'a_retirer'] },
    motifs: { type: 'array', items: { type: 'string', enum: [...MOTIFS] } },
    explication: { type: 'string', description: 'Deux ou trois phrases factuelles pour le modérateur.' },
  },
  required: ['avis', 'motifs', 'explication'],
  additionalProperties: false,
};
const Mod = z.object({ avis: z.enum(['conforme', 'a_verifier', 'a_retirer']), motifs: z.array(z.enum(MOTIFS)), explication: z.string() });
const MOD_SYSTEM = `Tu aides les modérateurs de CEA FOR AFRICA, communauté panafricaine d'entrepreneurs, à examiner un contenu.
Charte : pas de propos haineux, de harcèlement, de discrimination, de violence ni de contenu sexuel ; pas d'arnaque (promesses de gains, demandes d'argent ou de codes, faux recrutements), pas d'annonce trompeuse, pas de spam, pas de données personnelles d'autrui, pas de faux profil.
Pour une offre d'emploi : critères d'âge, de religion, d'origine, de sexe ou de situation familiale interdits ; frais demandés aux candidats = arnaque probable ; rémunération ou missions invraisemblables = à vérifier.
Donne un avis (conforme, à vérifier, à retirer), les motifs et une explication factuelle. Le modérateur décide. Réponds en français.`;

const unavailable = () => fail("L'assistance IA n'est pas disponible pour le moment.", 503);

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Requête invalide.');
  const b = p.data;

  if (b.action === 'dossier.analyse') {
    const u = staffApiAll(locals.user, 'dossier_kapital', 'M'); if (u instanceof Response) return u;
    if (!aiEnabled()) return unavailable();
    const facts = await analyseDossier(b.id);
    if (!facts) return fail('Dossier introuvable.', 404);
    const res = await askModel({ feature: 'analyse', userId: u.id, system: ANALYSE_SYSTEM, messages: [{ role: 'user', content: facts }], schema: ANALYSE_SCHEMA, maxTokens: 6000, effort: 'medium', timeoutMs: 90_000 });
    const out = res ? Analyse.safeParse((() => { try { return JSON.parse(replyText(res)); } catch { return null; } })()) : null;
    if (!out?.success) return fail('Pré-analyse impossible pour le moment. Réessayez dans un moment.', 502);
    await db.insert(aiNote).values({ subjectType: 'dossier', subjectId: b.id, feature: 'analyse', content: out.data, createdBy: u.id });
    await audit(u.id, 'ia.dossier.analyse', b.id, {}, clientIp(request));
    return json({ ok: true, message: 'Pré-analyse prête.' });
  }

  // Modération : publication de la communauté (périmètre pays du modérateur) ou offre d'emploi
  // Publications : périmètre pays du modérateur vérifié plus bas ; offres d'emploi : droit sur toutes les offres
  const u = b.kind === 'post' ? staffApi(locals.user, 'moderation', 'M') : staffApiAll(locals.user, 'offre_emploi', 'M');
  if (u instanceof Response) return u;
  if (!aiEnabled()) return unavailable();
  let text: string;
  if (b.kind === 'post') {
    const [pt] = await db.select({ body: post.body, c: profile.country }).from(post).leftJoin(profile, eq(profile.userId, post.authorId)).where(eq(post.id, b.id));
    const cs = await countriesFor(u, 'moderation', 'M');
    if (!pt || (cs && !cs.includes(pt.c ?? ''))) return fail('Accès refusé.', 403);
    text = `Publication dans le fil de la communauté :\n${pt.body}`;
  } else {
    const [j] = await db.select().from(job).where(eq(job.id, b.id));
    if (!j) return fail('Offre introuvable.', 404);
    text = `Offre d'emploi : ${j.title} — ${j.company} (${country(j.country)}), ${j.type}${j.remote ? ', télétravail' : ''}\nRémunération : ${j.salary ?? 'non précisée'}\nCompétences : ${j.skills.join(', ')}\nDescription :\n${j.description ?? '(vide)'}`;
  }
  const res = await askModel({ feature: 'moderation', userId: u.id, system: MOD_SYSTEM, messages: [{ role: 'user', content: text }], schema: MOD_SCHEMA, maxTokens: 2000 });
  const out = res ? Mod.safeParse((() => { try { return JSON.parse(replyText(res)); } catch { return null; } })()) : null;
  if (!out?.success) return fail('Avis indisponible pour le moment. Réessayez dans un moment.', 502);
  await db.insert(aiNote).values({ subjectType: b.kind, subjectId: b.id, feature: 'moderation', content: out.data, createdBy: u.id });
  await audit(u.id, `ia.moderation.${b.kind}`, b.id, { avis: out.data.avis }, clientIp(request));
  return json({ ok: true, message: 'Avis prêt.' });
};

