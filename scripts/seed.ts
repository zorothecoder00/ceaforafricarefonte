/* Données de démonstration — BASE LOCALE UNIQUEMENT (jamais en production).
   Usage : npm run db:seed            (ignore si déjà chargé)
           npm run db:seed -- --reset (vide les tables puis recharge ; le journal d'audit est conservé) */
import { config } from 'dotenv';
config({ path: '.env', override: true, quiet: true });

const url = process.env.DATABASE_URL ?? '';
const host = url ? new URL(url).hostname : '';
if (!['localhost', '127.0.0.1'].includes(host) || process.env.DB_TARGET === 'prod') {
  console.error(`✗ Refusé : le seed ne s'exécute que sur une base locale (hôte actuel : « ${host || 'inconnu'} »).`);
  process.exit(1);
}

const { db } = await import('../src/lib/db');
const { auth } = await import('../src/lib/auth');
const s = await import('../src/db/schema');
const { MEMBERS, JOBS, OPPS, PIPE0, FLAG0, SPACES, WGROUPS } = await import('../src/data/proto');
const { eq, sql } = await import('drizzle-orm');

const PASSWORD = 'Demo-CEA-2026!';
const reset = process.argv.includes('--reset');

if (reset) {
  const tables = await db.execute(sql`select format('%I.%I', schemaname, tablename) t from pg_tables where schemaname in ('public','kapital') and tablename <> 'audit_log'`);
  await db.execute(sql.raw(`truncate ${tables.rows.map((r) => (r as { t: string }).t).join(', ')} restart identity cascade`));
  console.log('• Tables vidées (journal d’audit conservé).');
}

const already = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'admin@cea.demo')).limit(1);
if (already.length) {
  console.log('• Données de démonstration déjà présentes. Utilisez « npm run db:seed -- --reset » pour recharger.');
  process.exit(0);
}

type Role = (typeof s.roleEnum.enumValues)[number];
const PEOPLE: { key: string; name: string; email: string; country: string; roles: Role[]; member?: string }[] = [
  { key: 'admin', name: 'Administrateur CEA', email: 'admin@cea.demo', country: 'TG', roles: ['admin', 'direction', 'membre'] },
  { key: 'analyste', name: 'Analyste Kapital', email: 'analyste@cea.demo', country: 'TG', roles: ['analyste', 'membre'] },
  { key: 'aicha', name: 'Aïcha Agbodjan', email: 'aicha@cea.demo', country: 'TG', roles: ['membre', 'entrepreneur'], member: 'Aïcha Agbodjan' },
  { key: 'kwame', name: 'Kwame Asante', email: 'kwame@cea.demo', country: 'GH', roles: ['membre', 'entrepreneur', 'employeur'], member: 'Kwame Asante' },
  { key: 'fatou', name: 'Fatou Ndiaye', email: 'fatou@cea.demo', country: 'SN', roles: ['membre', 'entrepreneur'], member: 'Fatou Ndiaye' },
  { key: 'ngozi', name: 'Ngozi Eze', email: 'ngozi@cea.demo', country: 'NG', roles: ['membre', 'mentor'], member: 'Ngozi Eze' },
  { key: 'jeanmarc', name: 'Jean-Marc Ekotto', email: 'jeanmarc@cea.demo', country: 'CM', roles: ['membre', 'investisseur'], member: 'Jean-Marc Ekotto' },
  { key: 'esther', name: 'Esther Mukamana', email: 'esther@cea.demo', country: 'RW', roles: ['membre', 'entrepreneur'], member: 'Esther Mukamana' },
  { key: 'kwesi', name: 'Kwesi Boateng', email: 'kwesi@cea.demo', country: 'GH', roles: ['membre', 'mentor'] },
  { key: 'editeur', name: 'Éditrice CEA', email: 'editeur@cea.demo', country: 'TG', roles: ['editeur', 'charge_programme', 'membre'] },
];

const ids: Record<string, string> = {};
for (const p of PEOPLE) {
  const res = await auth.api.signUpEmail({ body: { name: p.name, email: p.email, password: PASSWORD } });
  ids[p.key] = res.user.id;
  await db.update(s.user).set({ emailVerified: true }).where(eq(s.user.id, res.user.id));
  await db.insert(s.userRole).values(p.roles.map((role) => ({ userId: res.user.id, role }))).onConflictDoNothing();
  const m = MEMBERS.find((x) => x.n === p.member);
  await db.update(s.profile).set({
    country: p.country, sector: m?.s, headline: m?.r, needs: m?.need, offers: m?.offer,
    lang: 'fr', currency: p.country === 'NG' ? 'NGN' : p.country === 'GH' ? 'GHS' : p.country === 'CM' ? 'XAF' : p.country === 'RW' ? 'USD' : 'XOF',
  }).where(eq(s.profile.userId, res.user.id));
  await db.insert(s.consent).values({ userId: res.user.id, kind: 'profil_public', granted: true });
}
console.log(`• ${PEOPLE.length} comptes créés (mot de passe commun : ${PASSWORD}).`);

// Adhésions
const year = new Date(); year.setFullYear(year.getFullYear() + 1);
await db.insert(s.membership).values([
  { userId: ids.aicha, plan: 'premium', cardNumber: 'CEA-TG-1001', endsAt: year },
  { userId: ids.kwame, plan: 'membre', cardNumber: 'CEA-GH-1002', endsAt: year },
  { userId: ids.fatou, plan: 'entreprise', cardNumber: 'CEA-SN-1003', endsAt: year },
]);

// Offres d'emploi publiées
const TYPE: Record<string, (typeof s.jobTypeEnum.enumValues)[number]> = { CDI: 'CDI', CDD: 'CDD', Stage: 'Stage', Freelance: 'Freelance', Mission: 'Mission' };
await db.insert(s.job).values(JOBS.map((j) => ({
  employerId: j.co === 'PayLink Africa' ? ids.kwame : null,
  title: j.t, company: j.co, country: j.c, type: TYPE[j.type] ?? 'CDI', remote: j.remote, diaspora: !!(j as { diaspora?: boolean }).diaspora,
  salary: j.sal, skills: j.skills, status: 'publiee' as const, publishedAt: new Date(),
})));
console.log(`• ${JOBS.length} offres d'emploi.`);

// Dossiers Kapital (pipeline)
const STATUS: Record<string, (typeof s.dossierStatusEnum.enumValues)[number]> = { Reçu: 'recu', Diagnostic: 'diagnostic', Préparation: 'en_preparation', Comité: 'comite', Prêt: 'pret_presentation' };
const INSTR: Record<string, (typeof s.instrumentEnum.enumValues)[number]> = {
  'Actions de préférence': 'actions_preference', 'SAFE / BSA AIR': 'safe_bsa_air', 'Actions + dette': 'dette_privee', 'Obligations convertibles': 'obligations_convertibles', 'Dette mezzanine': 'mezzanine', 'Actions ordinaires': 'actions_ordinaires',
};
const VERIF: Record<string, (typeof s.verificationLevelEnum.enumValues)[number]> = { 'Vérifié par CEA': 'verifie', 'Diligence en cours': 'diligence_en_cours', Déclaratif: 'declaratif' };
const OWNER: Record<string, string> = { o1: ids.aicha, o2: ids.kwame, o4: ids.esther, o6: ids.fatou };
for (const o of OPPS) {
  const name = o.n.replace(/^Projet\s+/, '').replace(/[«»]/g, '').trim();
  const pipe = PIPE0.find((p) => name.startsWith(p.n));
  const [d] = await db.insert(s.dossier).values({
    reference: pipe?.id ?? `D-2026-0${500 + OPPS.indexOf(o)}`,
    ownerId: OWNER[o.id] ?? ids.admin, analystId: ids.analyste,
    companyName: name, country: o.c, sector: o.s, stage: o.st, amountXof: o.need, instrument: INSTR[o.inst],
    useOfFunds: o.use, traction: o.tr, team: o.team, status: STATUS[pipe?.st ?? ''] ?? 'pret_presentation',
    verification: VERIF[o.ver] ?? 'declaratif', shareConsent: true, published: true, investorReadyScore: Math.round(50 + o.prog / 2),
  }).returning({ id: s.dossier.id, status: s.dossier.status });
  await db.insert(s.dossierEvent).values({ dossierId: d.id, toStatus: d.status, actorId: ids.analyste, note: 'Import des données de démonstration' });
}
console.log(`• ${OPPS.length} dossiers Kapital.`);

// Investisseur vérifié + intérêt manifesté
await db.insert(s.investorProfile).values({ userId: ids.jeanmarc, category: 'averti', sectors: ['Santé', 'Éducation', 'Fintech'], countries: ['CM', 'TG', 'CI'], ticketMinXof: 12_000_000, ticketMaxXof: 60_000_000, kycStatus: 'verifie', verifiedAt: new Date() });

// Interrupteurs réglementaires (paramétrage de démonstration)
await db.insert(s.featureFlag).values(Object.entries(FLAG0).flatMap(([country, feats]) => Object.entries(feats).map(([feature, enabled]) => ({ country, feature, enabled, legalNote: 'Démonstration', updatedBy: ids.admin }))));

// Mentors et experts (créneaux hebdomadaires)
await db.insert(s.mentorProfile).values([
  { userId: ids.ngozi, kind: 'mentorat', expertise: 'Levée de fonds, modèle financier', sectors: ['Fintech', 'Santé'], languages: ['Anglais', 'Français'], timezone: 'Africa/Lagos', slots: [{ day: 2, time: '10:00' }, { day: 4, time: '15:00' }], rating: 49 },
  { userId: ids.kwesi, kind: 'expert', expertise: 'Modélisation financière', sectors: ['Industrie', 'Agro-industrie'], languages: ['Anglais'], timezone: 'Africa/Accra', priceXof: 30000, slots: [{ day: 1, time: '09:00' }, { day: 3, time: '14:00' }, { day: 5, time: '11:00' }], rating: 48 },
]);

// Espaces de la communauté et publications
const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
await db.insert(s.space).values(SPACES.map((x) => ({ id: slug(x.n), name: x.n, description: x.d, kind: x.n.startsWith('CEA ') ? 'pays' : 'theme', country: x.n === 'CEA Togo' ? 'TG' : null })));
await db.insert(s.spaceMember).values([{ spaceId: 'agritech-afrique', userId: ids.aicha }, { spaceId: 'cea-togo', userId: ids.aicha }, { spaceId: 'fintech-paiements', userId: ids.kwame }, { spaceId: 'femmes-entrepreneures', userId: ids.fatou }]);
await db.insert(s.post).values([
  { authorId: ids.aicha, spaceId: 'agritech-afrique', body: 'Nous cherchons un fournisseur de sacs hermétiques pour le stockage du gari au Togo. Des recommandations ?' },
  { authorId: ids.kwame, spaceId: 'fintech-paiements', body: 'Retour d’expérience : notre intégration Mobile Money multi-opérateurs a réduit les échecs de paiement de 40 %.' },
  { authorId: ids.fatou, body: 'Atelier export ZLECAf à Dakar le mois prochain : qui est intéressé ?' },
  { authorId: ids.esther, body: 'Message à vérifier : contactez-moi sur WhatsApp pour un investissement garanti à 30 % par mois.', status: 'en_moderation' },
]);

// Cercle Mastermind
const [mm] = await db.insert(s.circle).values({ name: 'Croissance Afrique de l’Ouest', stage: 'Croissance (2 à 5 ans)', facilitatorId: ids.ngozi }).returning({ id: s.circle.id });
await db.insert(s.circleMember).values([ids.aicha, ids.kwame, ids.fatou].map((userId) => ({ circleId: mm.id, userId })));
const inDays = (n: number) => new Date(Date.now() + n * 864e5);
const day = (n: number) => inDays(n).toISOString().slice(0, 10);
await db.insert(s.circleSession).values([
  { circleId: mm.id, startsAt: inDays(-30), agenda: 'Hot seat : Kwame — recrutement d’un directeur commercial', minutes: 'Décision : recruter en interne d’abord. Kwame présentera le profil au prochain cercle.' },
  { circleId: mm.id, startsAt: inDays(12), agenda: 'Hot seat : Aïcha — négociation bancaire' },
]);
const nowQ = new Date();
const quarter = `${nowQ.getFullYear()}-T${Math.floor(nowQ.getMonth() / 3) + 1}`;
await db.insert(s.circleCommitment).values([
  { circleId: mm.id, userId: ids.aicha, text: 'Signer le crédit d’équipement avec la banque', quarter },
  { circleId: mm.id, userId: ids.kwame, text: 'Recruter le directeur commercial', quarter, status: 'atteint' },
]);

// Project Studio
const [prj] = await db.insert(s.project).values({
  ownerId: ids.aicha, name: 'Unité de transformation de manioc — phase 2', sector: 'Agro-industrie', country: 'TG', stage: 'Croissance', status: 'en_structuration', public: true,
  sheet: {
    probleme: 'Les productrices de manioc perdent 30 % de leur récolte faute de transformation locale.',
    solution: 'Une unité de transformation en gari et farine HQCF, avec collecte auprès de 400 productrices.',
    marche: 'Marché régional du gari estimé à 180 milliards FCFA (Togo, Bénin, Ghana).',
    equipe: 'Aïcha (dirigeante, 12 ans d’expérience), un responsable qualité, 46 salariés.',
    modele: 'Vente B2B aux grossistes et à la grande distribution ; marge brute 38 %.',
    traction: '420 M FCFA de chiffre d’affaires 2025, +35 % par an.',
    besoins: '150 M FCFA pour une deuxième ligne de production.',
    impact: '400 productrices, 60 emplois supplémentaires prévus.',
  },
  maturity: { equipe: 4, marche: 4, produit: 4, traction: 4, modele: 3, finances: 3, gouvernance: 2, impact: 4 },
}).returning({ id: s.project.id });
await db.insert(s.projectTask).values([
  { projectId: prj.id, title: 'Étude de faisabilité de la ligne 2', owner: 'Aïcha', startOn: day(-20), dueOn: day(10), status: 'en_cours', budgetXof: 3_000_000, spentXof: 1_200_000 },
  { projectId: prj.id, title: 'Devis des équipements', owner: 'Resp. qualité', startOn: day(5), dueOn: day(25), budgetXof: 500_000 },
  { projectId: prj.id, title: 'Accord de crédit signé', dueOn: day(60), milestone: true },
]);
await db.insert(s.skillCall).values({ projectId: prj.id, need: 'Ingénieur·e process agroalimentaire (mission de 3 mois)', kind: 'expert' });

// Candidature à un emploi, codes promo, propositions, commissions, abonné à la lettre
const [pl] = await db.select({ id: s.job.id }).from(s.job).where(eq(s.job.company, 'PayLink Africa')).limit(1);
if (pl) await db.insert(s.jobApplication).values({ jobId: pl.id, userId: ids.esther });
await db.insert(s.promoCode).values([{ code: 'FORUM20', eventId: 'e1', percent: 20, maxUses: 100 }, { code: 'MEMBRE10', percent: 10 }]);
const [pr] = await db.insert(s.proposal).values({
  userId: ids.fatou, title: 'Plafonner à 60 jours les délais de paiement des marchés publics', theme: WGROUPS[0], country: 'SN', status: 'en_discussion',
  body: 'Les PME attendent souvent plus de 120 jours le paiement des marchés publics, ce qui étrangle leur trésorerie. Nous proposons un plafond légal de 60 jours avec intérêts de retard automatiques.',
  response: 'Inscrite à l’ordre du jour de la commission Fiscalité du mois prochain.',
}).returning({ id: s.proposal.id });
await db.insert(s.proposalSupport).values([ids.fatou, ids.aicha, ids.kwame].map((userId) => ({ proposalId: pr.id, userId })));
await db.insert(s.workingGroupMember).values([{ group: WGROUPS[0], userId: ids.fatou }, { group: WGROUPS[1], userId: ids.aicha }]);
await db.insert(s.newsletterSubscription).values({ email: 'abonne@cea.demo', topics: ['kapital'], country: 'TG', confirmedAt: new Date() });
console.log('• Mentors, espaces, cercle, projet, codes promo et propositions.');

await db.insert(s.auditLog).values({ actorId: ids.admin, action: 'seed', target: 'base locale', meta: { comptes: PEOPLE.length } });
console.log('✓ Données de démonstration chargées.');
process.exit(0);
