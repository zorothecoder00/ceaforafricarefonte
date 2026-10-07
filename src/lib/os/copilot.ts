/* CEA OS — CEA Copilot interne (prototype › SYS, context, localAnswer, quickAI) : l'assistant répond uniquement à partir des
   données que l'utilisateur est autorisé à voir (ses demandes, son solde de congés, ses tâches, ses approbations ; pour les
   managers et la finance : encaissements, factures en retard, membres, inscriptions, chantiers, budgets du périmètre).
   Sans IA disponible, des réponses locales couvrent les questions courantes. Les rédactions (synthèse de la semaine, rapport
   d'impact, rapport bailleur, analyse des propositions) sont construites côté serveur à partir des données réelles. */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { invoice } from '../../db/schema/finance';
import { proposal } from '../../db/schema/app';
import { osRequest, osTask, osSite, osSiteLot, osInscription, osProject, osDecision } from '../../db/schema/os';
import { canUse, MANAGERS, type OsCtx, type scopeState } from './core';
import { pendingFor, budgets } from './approvals';
import { memberBase } from './relations';
import { marge } from './domaines';
import { computeImpact } from '../impact';
import { DK, DOM, PK, RTYPE, pn, fcfa, mfcfa, refT, type ReqType } from './ref';
import type { Person } from './core';

type Sc = ReturnType<typeof scopeState>;

export const SYS = `Tu es CEA Copilot, l'assistant interne de CEA OS, le progiciel de gestion globale de CEA FOR AFRICA. Réponds en français, de façon concise (8 lignes au plus), sans titres ni mise en forme Markdown, uniquement à partir des données fournies ; si l'information manque ou dépasse les droits de l'utilisateur, dis-le. Tu peux expliquer comment faire une démarche dans CEA OS (congé : Accueil › « Demander un congé » ; note de frais : Accueil › « Note de frais » ; demande d'achat : Accueil › « Demande d'achat » ; problème informatique ou logistique : Support › « Signaler un problème »). Tu ne décides jamais à la place de l'utilisateur : approbations, recrutements, investissements et sanctions restent des décisions humaines. Ne demande jamais de mot de passe ni de code.`;

const today = () => new Date().toISOString().slice(0, 10);

async function lateInvoices(sc: Sc) {
  return (await db.select({ number: invoice.number, buyer: invoice.buyer, total: invoice.totalXof, country: invoice.country, domain: invoice.domain }).from(invoice)
    .where(and(eq(invoice.kind, 'facture'), eq(invoice.status, 'a_payer'), sql`${invoice.dueOn} < ${today()}`)))
    .filter((x) => sc.inScope({ country: x.country, domain: x.domain }));
}

/** Données autorisées de l'utilisateur, en texte, jointes à chaque question (prototype › context()). */
export async function contextText(os: OsCtx, sc: Sc, people: Person[]) {
  const me = os.me;
  const lines: string[] = [];
  if (me) {
    const [reqs, tasks, pend] = await Promise.all([
      db.select().from(osRequest).where(and(eq(osRequest.byStaff, me.id), eq(osRequest.status, 'En approbation'))),
      db.select().from(osTask).where(and(eq(osTask.owner, me.id), sql`${osTask.status} <> 'Terminé'`)),
      pendingFor(me.id, { people }),
    ]);
    const mgr = people.find((s) => s.id === me.managerId);
    lines.push(`Utilisateur : ${me.name}, ${refT(me.poste)} (${pn(me.country)}). Responsable : ${mgr?.name ?? 'aucun'}. Périmètre affiché : ${sc.label}.`);
    lines.push(`Ses demandes en cours : ${reqs.map((r) => `${RTYPE[r.type as ReqType] ?? r.type} ${r.id} (${r.title})`).join(', ') || 'aucune'}. Solde de congés : ${me.leaveDays} jours.`);
    lines.push(`Ses tâches ouvertes : ${tasks.map((t) => t.title).join(' ; ') || 'aucune'}. Approbations qui l'attendent : ${pend.length}.`);
  } else lines.push(`Utilisateur : ${os.user.name}, administrateur de la plateforme (sans fiche de personnel). Périmètre : ${sc.label}.`);
  if (canUse(MANAGERS + ' fin', os)) {
    const year = new Date().getFullYear();
    const [[paid], [due], late, base, ins, sites, lots, bud] = await Promise.all([
      db.select({ s: sql<number>`coalesce(sum(${invoice.totalXof}),0)::float` }).from(invoice).where(and(eq(invoice.kind, 'facture'), eq(invoice.status, 'payee'), eq(invoice.year, year))),
      db.select({ s: sql<number>`coalesce(sum(${invoice.totalXof}),0)::float` }).from(invoice).where(and(eq(invoice.kind, 'facture'), eq(invoice.status, 'a_payer'))),
      lateInvoices(sc),
      memberBase(),
      db.select({ c: osInscription.country, d: osInscription.domains }).from(osInscription).where(eq(osInscription.status, 'En attente')),
      db.select().from(osSite),
      db.select().from(osSiteLot),
      budgets(year),
    ]);
    const ps = PK.filter((p) => sc.inScope({ country: p }));
    lines.push(`Encaissé en ${year} : ${mfcfa(paid.s)} ; à encaisser : ${mfcfa(due.s)} ; factures en retard : ${late.map((x) => `${x.number} ${(x.buyer as { name?: string }).name ?? ''} ${fcfa(x.total)}`).join(', ') || 'aucune'}.`);
    lines.push(`Membres par pays : ${ps.map((p) => `${pn(p)} ${Object.values(base[p] ?? {}).reduce((a, b) => a + b, 0)}`).join(', ')}. Inscriptions en attente : ${ins.filter((x) => sc.inScope({ country: x.c, domain: x.d })).length}.`);
    const sv = sites.filter((x) => sc.inScope({ country: x.country }));
    if (sv.length) lines.push(`Chantiers BTP : ${sv.map((x) => { const m = marge(x.amount, lots.filter((l) => l.siteId === x.id)); return `${x.name} avancement ${m.av.toFixed(0)} %, marge ${m.pct.toFixed(1)} %`; }).join(' ; ')}.`);
    lines.push(`Budgets engagés : ${DK.filter((d) => sc.inScope({ domain: d }) && bud[d]?.budget).map((d) => `${DOM[d].n} ${Math.round((bud[d].engaged / bud[d].budget) * 100)} %`).join(', ')}.`);
  }
  return lines.join('\n');
}

/** Réponses sans IA (prototype › localAnswer). */
export async function localAnswer(q: string, os: OsCtx, sc: Sc, people: Person[]) {
  const s = q.toLowerCase(), me = os.me;
  if (/cong/.test(s)) return me ? `Votre solde est de ${me.leaveDays} jours. Pour poser un congé : Accueil › « Demander un congé ». Circuit : ${people.find((p) => p.id === me.managerId)?.name ?? 'votre responsable'} puis Ressources humaines.` : "Vous n'avez pas de fiche de personnel : pas de solde de congés.";
  if (/frais/.test(s)) return 'Accueil › « Note de frais » : objet, montant, photo du justificatif. Circuit : votre responsable puis la finance, remboursement par Mobile Money.';
  if (/retard|impay/.test(s)) {
    if (!canUse(MANAGERS + ' fin', os)) return 'Les factures ne font pas partie de vos droits.';
    const l = await lateInvoices(sc);
    return l.length ? l.slice(0, 6).map((x) => `• ${x.number} — ${(x.buyer as { name?: string }).name ?? ''} — ${fcfa(x.total)}`).join('\n') : 'Aucune facture en retard dans votre périmètre.';
  }
  if (/approb/.test(s)) return me ? `Vous avez ${(await pendingFor(me.id, { people })).length} approbation(s) en attente.` : 'Aucune approbation ne vous est attribuée.';
  if (/tâche|tache/.test(s)) {
    if (!me) return 'Aucune tâche ouverte.';
    const t = await db.select().from(osTask).where(and(eq(osTask.owner, me.id), sql`${osTask.status} <> 'Terminé'`));
    return t.length ? t.map((x) => '• ' + x.title).join('\n') : 'Aucune tâche ouverte.';
  }
  if (/ticket|panne|informatique|imprimante/.test(s)) return 'Support › « Signaler un problème » : objet, catégorie, urgence. L\'équipe informatique est prévenue ; délai cible 4 h pour un problème bloquant.';
  return 'En mode hors ligne, je réponds sur : congés, notes de frais, factures en retard, approbations, tâches, support.';
}

/** Rédactions guidées (prototype › quickAI) : la consigne est construite ici, à partir des données réelles. */
export async function taskPrompt(kind: string, id: string | undefined, os: OsCtx, sc: Sc): Promise<string | { error: string }> {
  if (kind === 'semaine') {
    if (!canUse(MANAGERS, os)) return { error: 'Synthèse réservée aux managers.' };
    const dec = await db.select().from(osDecision).orderBy(desc(osDecision.at)).limit(5);
    return `Rédige la synthèse de la semaine pour ${os.me?.name ?? 'la direction'} (périmètre : ${sc.label}) : 3 faits marquants, 3 points d'attention, 3 actions prioritaires, à partir des données ci-dessus. Décisions récentes : ${dec.map((d) => `${d.text} (${d.status})`).join(' ; ') || 'aucune'}.`;
  }
  if (kind === 'impact') {
    const d = await computeImpact({ country: sc.sc.startsWith('p:') ? sc.sc.slice(2) : undefined });
    return `Rédige en français une synthèse d'impact (10 lignes) pour un bailleur à partir de ces indicateurs mesurés au ${d.asOf} : ${d.kpis.map((k) => `${k.label} : ${k.display}`).join(' ; ')}. Aligne sur les ODD 5 et 8 et l'Agenda 2063. N'invente aucun chiffre ; une valeur « — » ou masquée n'est pas publiable.`;
  }
  if (kind === 'bailleur') {
    if (!canUse('dg adg ops dirreg rep chef:prj agent:prj', os)) return { error: 'Accès refusé.' };
    const [p] = id && /^[0-9a-f-]{36}$/.test(id) ? await db.select().from(osProject).where(eq(osProject.id, id)) : [];
    if (!p || !sc.inScope({ country: p.country })) return { error: 'Projet introuvable.' };
    return `Rédige en français un rapport d'avancement trimestriel (structure : résumé, activités, budget, jalons, difficultés, prochaines étapes ; 15 lignes) pour le bailleur « ${p.funder || 'non précisé'} » du projet « ${p.name} » de CEA FOR AFRICA en ${pn(p.country)} : avancement ${p.progress} %, budget ${mfcfa(p.budget)}, réalisé ${mfcfa(p.spent)}, jalons : ${p.milestones.map((j) => j[0] + (j[1] ? ' atteint' : ' à venir')).join(', ') || 'aucun'}, santé ${p.health === 'ok' ? 'bonne' : p.health === 'warn' ? 'à surveiller' : 'en difficulté'}. N'invente aucun chiffre.`;
  }
  if (kind === 'voix') {
    if (!canUse('dg adg ops dirreg rep chef:voix agent:voix com', os)) return { error: 'Accès refusé.' };
    const l = (await db.select({ t: proposal.title, b: proposal.body, c: proposal.country, th: proposal.theme }).from(proposal).orderBy(desc(proposal.createdAt)).limit(80)).filter((x) => !x.c || sc.inScope({ country: x.c }));
    if (!l.length) return { error: 'Aucune proposition à analyser dans votre périmètre.' };
    return `Tu analyses pour CEA Voix des Entrepreneurs les ${l.length} propositions de plaidoyer déposées par les membres (texte ci-après). Dégage les thèmes dominants (4 au plus) avec leur part approximative et une citation courte tirée des textes, puis 2 recommandations de plaidoyer. 10 lignes au plus.\n${l.map((x, k) => `${k + 1}. [${x.c ? pn(x.c) : '—'}${x.th ? ' · ' + x.th : ''}] ${x.t} — ${x.b.slice(0, 300)}`).join('\n')}`;
  }
  return { error: 'Demande inconnue.' };
}
