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
const { MEMBERS, JOBS, OPPS, PIPE0, FLAG0 } = await import('../src/data/proto');
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

await db.insert(s.auditLog).values({ actorId: ids.admin, action: 'seed', target: 'base locale', meta: { comptes: PEOPLE.length } });
console.log('✓ Données de démonstration chargées.');
process.exit(0);
