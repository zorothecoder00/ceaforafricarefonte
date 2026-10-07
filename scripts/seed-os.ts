/* CEA OS — personnel et budgets de démonstration (noms du prototype CEA OS) — BASE LOCALE UNIQUEMENT.
   Usage : npx tsx scripts/seed-os.ts           (ignore si le personnel existe déjà)
           npx tsx scripts/seed-os.ts --reset   (vide les tables de CEA OS puis recharge)
   Comptes rattachés : admin@cea.demo = Direction générale, analyste@cea.demo = analyste Kapital, editeur@cea.demo = communication. */
import { config } from 'dotenv';
config({ path: '.env', override: true, quiet: true });

const url = process.env.DATABASE_URL ?? '';
const host = url ? new URL(url).hostname : '';
if (!['localhost', '127.0.0.1'].includes(host) || process.env.DB_TARGET === 'prod') {
  console.error(`✗ Refusé : ce script ne s'exécute que sur une base locale (hôte actuel : « ${host || 'inconnu'} »).`);
  process.exit(1);
}

const { db } = await import('../src/lib/db');
const s = await import('../src/db/schema');
const { and, eq, sql, inArray } = await import('drizzle-orm');
const { PDOM, DOM, BANDS, gradeOf, profOf, pn, DK } = await import('../src/lib/os/ref');

if (process.argv.includes('--reset')) {
  await db.execute(sql`truncate os_event_fin, os_project, os_capital, os_site_lot, os_site_log, os_site_statement, os_site_sub, os_site_hse, os_site, os_tender, os_inscription, os_report, os_candidate, os_recruit, os_payroll, os_ledger, os_closing, os_treasury, os_receipt, os_po, os_stock_move, os_stock_item, os_supplier, os_contract, os_okr, os_risk, os_audit, os_review_item, os_review, os_interview, os_flow, os_country, os_message, os_channel_seen, os_channel, os_meeting, os_task, os_decision, os_request, os_delegation, os_timesheet, os_budget, staff restart identity cascade`);
  console.log('• Tables de CEA OS vidées.');
}
const [any] = await db.select({ id: s.staff.id }).from(s.staff).limit(1);
if (any) { console.log('• Personnel déjà chargé (relancez avec --reset pour recharger).'); process.exit(0); }

// Générateur pseudo-aléatoire déterministe (comme le prototype)
let seed = 20261002;
const R = () => { seed = Math.imul(48271, seed) % 2147483647; return (seed & 2147483647) / 2147483647; };
const rint = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));

type Row = typeof s.staff.$inferInsert;
const rows: Row[] = [];
let n = 0;
const add = (name: string, poste: string, country: string, mgr: string | null, dep = ''): string => {
  n++;
  const id = 'EMP' + String(n).padStart(3, '0');
  const g = gradeOf(poste);
  const dom = PDOM[poste] ?? null;
  rows.push({
    id, name, email: name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.') + '@cea4africa.com', phone: '+228 90 00 ' + String(10 + n).padStart(2, '0') + ' ' + String(rint(10, 99)),
    poste, country, domain: dom, managerId: mgr, grade: g, department: dep || (dom ? DOM[dom].n : profOf(poste) === 'rep' ? 'Bureau de représentation ' + pn(country) : profOf(poste) === 'dirreg' ? 'Bureau régional' : 'Direction générale'),
    salary: BANDS[g][0] + rint(0, 4) * 50000, leaveDays: rint(4, 26), hireDate: new Date(Date.now() - rint(60, 1400) * 864e5), onboarding: null,
  });
  return id;
};
const dg = add('Kossi Agbéko', 'A1', 'TG', null);
add('Afi Mensah', 'A2', 'TG', dg);
const coo = add('Mawunyo Ahiafor', 'A3', 'TG', dg);
add('Kafui Dovi', 'A4', 'TG', coo);
const rh = add('Délali Kuma', 'A5', 'TG', dg, 'Ressources humaines');
add('Sena Adjo', 'A6', 'TG', dg, 'Juridique');
const conf = add('Yawa Dossou', 'A7', 'TG', dg, 'Conformité');
const fin = add('Ama Lawson', 'D1', 'TG', dg, 'Finance');
add('Yao Tchalla', 'D2', 'TG', fin, 'Finance');
add('Esi Amouzou', 'D3', 'TG', fin, 'Finance');
add('Komi Atsu', 'D5', 'TG', fin, 'Finance');
const it = add('Kodjo Amegee', 'D6', 'TG', dg, 'Informatique');
add('Mireille Gbedey', 'D7', 'TG', it, 'Informatique');
add('Mawuli Ahadji', 'F2', 'TG', dg, 'Communication');
add('Aïcha Ouattara', 'C4', 'TG', conf, 'Conformité');
const chefs: Record<string, string> = {};
for (const [d, nm, code] of [['act', 'Nadia Akakpo', 'C1'], ['kap', 'Kofi Mensah-Attipoe', 'C2'], ['prj', 'Edem Agbo', 'C6'], ['evt', 'Abla Tsogbe', 'C8'], ['tal', 'Selom Kpeglo', 'C10'], ['mm', 'Fafa Adzo', 'C12'], ['aca', 'Kokou Ayivi', 'C14'], ['voix', 'Kafui Ameyo', 'C17'], ['btp', 'Edem Kpodar', 'C19']] as const) chefs[d] = add(nm, code, 'TG', coo);
add('Afi Lawson', 'C3', 'TG', chefs.kap);
add('Ruth Nana', 'C3', 'GH', chefs.kap);
add('Essé Amegan', 'C15', 'TG', chefs.aca);
add('Ablavi Tossa', 'C22', 'TG', chefs.btp);
const dirs: Record<string, string> = {};
for (const [r, nm, c] of [['AO', 'Komlan Adzoh', 'TG'], ['AC', 'Brice Ngono', 'CM'], ['AE', 'Wanjiku Mwangi', 'KE'], ['AA', 'Sipho Ndlovu', 'ZA'], ['AN', 'Nadia Benjelloun', 'MA']] as const) dirs[r] = add(nm, 'B1', c, dg);
const REG: Record<string, string> = { TG: 'AO', CI: 'AO', SN: 'AO', BJ: 'AO', NG: 'AO', GH: 'AO', ML: 'AO', BF: 'AO', CM: 'AC', CD: 'AC', GA: 'AC', KE: 'AE', RW: 'AE', ET: 'AE', ZA: 'AA', MA: 'AN', EG: 'AN' };
for (const [c, nm] of [['TG', 'Akossiwa Amegah'], ['CI', 'Yao Kouamé'], ['SN', 'Awa Sarr'], ['BJ', 'Rodrigue Hounsa'], ['NG', 'Tunde Bakare'], ['GH', 'Efua Owusu'], ['CM', 'Paul Nkeng'], ['KE', 'Grace Atieno'], ['MA', 'Youssef Benali']] as const) {
  const rep = add(nm, 'B2', c, dirs[REG[c]]);
  if (['TG', 'CI', 'SN'].includes(c)) add(['Konan Ble', 'Ndèye Fall', 'Edwige Koudjo'][['CI', 'SN', 'TG'].indexOf(c)], 'B3', c, rep);
}
add('Kossivi Dogbe', 'C21', 'TG', chefs.btp);
add('Rodrigue Agossou', 'C21', 'BJ', chefs.btp);
await db.insert(s.staff).values(rows);

// Comptes de démonstration rattachés
const link = async (email: string, id: string) => {
  const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email));
  if (u) await db.update(s.staff).set({ userId: u.id }).where(eq(s.staff.id, id));
};
await link('admin@cea.demo', dg);
await link('analyste@cea.demo', rows.find((r) => r.name === 'Afi Lawson')!.id!);
await link('editeur@cea.demo', rows.find((r) => r.poste === 'F2')!.id!);
// Une arrivée récente avec son parcours d'intégration
await db.update(s.staff).set({ hireDate: new Date(Date.now() - 34 * 864e5), onboarding: [true, false, false] }).where(inArray(s.staff.name, ['Ruth Nana']));

// Budgets 2026 par domaine
const year = new Date().getFullYear();
await db.insert(s.osBudget).values(DK.map((d) => { const b = rint(40, 420) * 1e6; return { year, domain: d, budget: b, engaged: Math.round(b * (0.3 + R() * 0.4)), realised: Math.round(b * (0.25 + R() * 0.3)) }; }));
// Collaboration : tâches, réunions, décisions, messages (contenus du prototype)
const P = (pred: (r: Row) => boolean) => rows.find(pred)!.id!;
const ago = (d: number) => new Date(Date.now() - d * 864e5);
const { ensureChannels } = await import('../src/lib/os/collab');
const { allStaff } = await import('../src/lib/os/core');
await ensureChannels(await allStaff());
const TASKS: [string, string, string, string][] = [
  ['Valider les inscriptions en attente du Togo', P((r) => r.poste === 'B2' && r.country === 'TG'), 'TG', 'voix'], ['Préparer le comité Kapital du 14 octobre', chefs.kap, 'TG', 'kap'],
  ['Situation de travaux n°3 — Kara', chefs.btp, 'TG', 'btp'], ['Rapport bailleur Agritech T3', dg, 'ML', 'prj'], ['Clôture comptable de septembre', fin, 'TG', 'prj'],
  ['Revue trimestrielle des droits', conf, 'TG', 'act'], ["Budget 2027 de la région Afrique de l'Ouest", dirs.AO, 'CI', 'evt'], ["Préparer la paie d'octobre", rh, 'TG', 'prj'],
];
await db.insert(s.osTask).values(TASKS.map(([title, owner, country, domain], k) => ({ title, owner, country, domain, status: k % 2 ? 'En cours' : 'À faire', due: ago(-rint(-3, 20)), createdBy: dg })));
await db.insert(s.osDecision).values([
  { text: 'Ouverture du bureau de représentation du Gabon', status: 'Décidé', at: ago(3), by: dg },
  { text: "Seuil d'approbation régionale porté à 5 M FCFA", status: 'Décidé', at: ago(9), by: dg },
  { text: "Participation à l'appel d'offres du lycée technique (AO-26-031)", status: 'En attente', at: ago(1), by: chefs.btp },
]);
await db.insert(s.osMeeting).values([
  { title: 'Comité de direction', at: ago(-2), hour: '09:00', duration: 90, place: 'Siège, Lomé et visio', participants: [dg, coo, fin, chefs.kap, chefs.btp, rh], agenda: "Budget 2027 ; ouverture du Gabon ; appel d'offres du lycée technique", organizer: dg },
  { title: 'Point chantier Kara', at: ago(-1), hour: '09:00', place: 'Visio', participants: [chefs.btp, dg, P((r) => r.poste === 'C21' && r.country === 'TG')], agenda: 'Avancement des lots, sécurité, situation n°3', organizer: chefs.btp },
]);
await db.insert(s.osMessage).values([
  { channelId: 'general', staffId: dg, body: 'Bienvenue à tous sur CEA OS. Désormais, approbations, demandes et échanges passent par ici.', at: ago(1) },
  { channelId: 'general', staffId: P((r) => r.poste === 'F2'), body: 'Rappel : le Forum panafricain approche, inscrivez vos invités avant le 15 novembre.', at: ago(0.5) },
  { channelId: 'dep_finance', staffId: fin, body: 'Clôture de septembre : merci de transmettre vos justificatifs avant vendredi.', at: ago(2) },
  { channelId: 'dom_btp', staffId: chefs.btp, body: 'Point chantier Kara jeudi 9 h, en visio pour les autres pays.', at: ago(1) },
  { channelId: 'reg_AO', staffId: dirs.AO, body: 'Les rapports mensuels de septembre sont attendus avant le 5.', at: ago(3) },
]);
// Pilotage : objectifs en cascade, risques, missions d'audit (contenus du prototype)
const okr = async (title: string, level: string, owner: string, parentId: string | null = null, progress = 0) => (await db.insert(s.osOkr).values({ title, level, owner, parentId, progress }).returning())[0].id;
const o1 = await okr('Atteindre 40 000 membres validés', 'Organisation', dg);
const o2 = await okr('Lever 5 Md FCFA pour les entreprises accompagnées', 'Organisation', dg);
const o3 = await okr('Remporter 3 marchés BTP publics', 'Organisation', dg);
const o4 = await okr('Clôture mensuelle en 8 jours ouvrés', 'Organisation', dg);
const o1a = await okr("Afrique de l'Ouest : 24 000 membres", 'Région', dirs.AO, o1, 66);
await okr('Afrique centrale : 6 000 membres', 'Région', dirs.AC, o1, 48);
await okr("Afrique de l'Est : 6 000 membres", 'Région', dirs.AE, o1, 57);
await okr('Togo : 9 000 membres', 'Pays', P((r) => r.poste === 'B2' && r.country === 'TG'), o1a, 71);
await okr("60 dossiers au comité d'investissement", 'Département', chefs.kap, o2, 38);
await okr('100 investisseurs vérifiés actifs', 'Département', chefs.kap, o2, 45);
await okr("Répondre à 12 appels d'offres", 'Département', chefs.btp, o3, 50);
await okr('Bibliothèque de prix pour 5 pays', 'Département', chefs.btp, o3, 40);
await okr('Rapprochement automatique ≥ 95 %', 'Fonction', P((r) => r.poste === 'D3'), o4, 80);
await okr('Comptes justifiés à chaque clôture', 'Fonction', P((r) => r.poste === 'D2'), o4, 70);
await db.insert(s.osRisk).values([
  { title: "Retard de paiement d'un maître d'ouvrage public", domain: 'btp', probability: 4, impact: 4, owner: chefs.btp, plan: "Clauses d'intérêts moratoires, suivi mensuel", country: 'TG' },
  { title: 'Concentration des revenus sur le Forum', domain: 'evt', probability: 3, impact: 3, owner: chefs.evt, plan: 'Diversifier les sponsors', country: 'TG' },
  { title: 'Validation des inscriptions au-delà de 48 h', domain: 'voix', probability: 3, impact: 2, owner: chefs.voix, plan: 'Renfort temporaire dans 3 pays', country: 'TG' },
  { title: "Dépendance à un agrégateur de paiement", domain: 'prj', probability: 2, impact: 4, owner: fin, plan: 'Second agrégateur en V2', country: 'TG' },
  { title: "Fuite de données d'un dossier Kapital", domain: 'kap', probability: 1, impact: 5, owner: conf, plan: 'Cloisonnement, revue des droits', country: 'TG' },
]);
await db.insert(s.osAudit).values([{ title: 'Achats et séparation des tâches', status: 'En cours', findings: 2 }, { title: 'Rapprochements Mobile Money', status: 'Planifié', findings: 0 }]);
// Gestion : fournisseurs, stocks, bons de commande, contrats, trésorerie, factures et encaissements (contenus du prototype)
const finId = P((r) => r.poste === 'D2');
await db.insert(s.osSupplier).values(([['Ciments du Golfe (fictifs)', 'Matériaux', 'TG', 'Vérifié'], ['Électro Services (fictif)', 'Sous-traitance', 'BJ', 'Vérifié'], ['Imprimerie Moderne (fictive)', 'Impression', 'TG', 'Vérifié'], ['Traiteur Délices (fictif)', 'Restauration', 'CI', 'Vérifié'], ['Location Engins Plus (fictif)', 'Location matériel', 'SN', 'À vérifier'], ['Fournitures Bureau Afrique (fictif)', 'Fournitures', 'TG', 'Vérifié']] as const).map(([name, category, country, status], k) => ({ id: `FRN-${10 + k}`, name, category, country, status, iban: `TG53 •••• •••• ${rint(1000, 9999)}`, createdBy: finId })));
await db.insert(s.osStockItem).values(([['CIM-50', 'Ciment 50 kg', 'sac', 420, 200, 'TG', 5200], ['FER-12', 'Fer à béton 12 mm', 'barre', 310, 150, 'TG', 6800], ['BRQ-15', 'Briques 15', 'unité', 8400, 3000, 'BJ', 350], ['KIT-EVT', 'Kit événement (badges, cordons)', 'kit', 140, 200, 'TG', 2500], ['PAP-A4', 'Papier A4', 'ramette', 60, 40, 'TG', 3500], ['CAS-CHT', 'Casque de chantier', 'unité', 48, 30, 'CI', 4500]] as const).map(([code, label, unit, qty, min, country, unitCost]) => ({ code, label, unit, qty, min, country, unitCost })));
await db.insert(s.osPo).values([
  { id: 'BC-2026-071', byStaff: P((r) => r.poste === 'C21' && r.country === 'TG'), supplierId: 'FRN-10', label: 'Ciment 50 kg × 300', itemCode: 'CIM-50', qty: 300, amount: 1560000, country: 'TG', domain: 'btp', status: 'Commandé', createdAt: ago(6) },
  { id: 'BC-2026-072', byStaff: chefs.evt, supplierId: 'FRN-12', label: 'Badges Forum 2026', itemCode: 'KIT-EVT', qty: 500, amount: 1250000, country: 'TG', domain: 'evt', status: 'Livré', createdAt: ago(12) },
]);
await db.insert(s.osContract).values(([['Convention Fondation Partenaire 2026', 'Fondation Partenaire (fictive)', 'Convention de financement', 'prj', 'TG', 180e6, 240, 90], ['Marché Centre de formation de Kara', "Ministère de l'Enseignement technique (fictif)", 'Marché de travaux', 'btp', 'TG', 820e6, 300, 240], ['Sous-traitance électricité Parakou', 'Électro Services (fictif)', 'Sous-traitance', 'btp', 'BJ', 86e6, 120, 45], ['Bail des bureaux de Lomé', 'SCI Golfe (fictive)', 'Bail', 'prj', 'TG', 36e6, 700, 25], ['Licences logicielles', 'Éditeur (fictif)', 'Abonnement', 'prj', 'TG', 12e6, 300, 40], ['Contrat traiteur Forum 2026', 'Traiteur Délices (fictif)', 'Prestation', 'evt', 'TG', 22e6, 20, 55]] as const).map(([title, party, type, domain, country, amount, start, end], k) => ({ id: `CTR-${30 + k}`, title, party, type, domain, country, amount, start: ago(start), end: ago(-end), status: 'En vigueur', owner: P((r) => r.poste === 'A6') })));
await db.insert(s.osTreasury).values([['Banque — compte principal (Lomé)', '521', 412e6], ['Banque — compte Abidjan', '521', 96e6], ['Orange Money marchand', '585', 8.4e6], ['Wave marchand', '585', 5.1e6], ['MTN MoMo marchand (Ghana)', '585', 3.2e6], ['Caisse siège', '571', 1.2e6]].map(([name, account, balance]) => ({ name: name as string, account: account as string, balance: balance as number })));
const { issue } = await import('../src/lib/invoices');
const CLIENTS: [string, string, number, string, string, number][] = [['Ministère du Commerce (fictif)', 'Formation des agents', 4500000, 'aca', 'TG', -20], ['Banque Atlantique (fictive)', 'Sponsoring Forum 2026', 9800000, 'evt', 'CI', 15], ['Groupe Habitat Plus', 'Situation de travaux n°2 — Cité Verte', 24000000, 'btp', 'CI', -5], ['AgroSahel', 'Accompagnement levée de fonds', 1800000, 'kap', 'SN', 30]];
await db.delete(s.invoice).where(and(eq(s.invoice.purpose, 'autre'), inArray(sql`${s.invoice.buyer}->>'name'`, CLIENTS.map((c) => c[0])))); // factures de démonstration d'un chargement précédent
for (const [name, label, amount, domain, country, due] of CLIENTS) await issue({ kind: 'facture', buyer: { name }, purpose: 'autre', lines: [{ label, qty: 1, unitXof: amount }], totalHtXof: amount, taxRate: 0, taxXof: 0, totalXof: amount, status: 'a_payer', dueOn: ago(-due).toISOString().slice(0, 10), country, domain });
const [inv1] = await db.select({ n: s.invoice.number }).from(s.invoice).where(eq(s.invoice.totalXof, 1800000));
await db.insert(s.osReceipt).values([{ source: 'Orange Money', amount: 1800000, ref: `Paiement ${inv1?.n ?? ''}` }, { source: 'Wave', amount: 4500000, ref: 'MINCOM FORMATION' }, { source: 'Virement', amount: 350000, ref: 'VIR 0045' }]);
// Recrutement : un poste publié avec deux candidatures (contenus du prototype)
await db.insert(s.osRecruit).values({ id: 'REC-21', poste: 'D4', country: 'TG', byStaff: fin, status: 'Publiée', salary: 1000000, why: 'Renfort du contrôle de gestion avant la clôture annuelle.', createdAt: ago(20) });
await db.insert(s.osCandidate).values([
  { recruitId: 'REC-21', name: 'Afi Kodjo', email: 'afi.kodjo@exemple.africa', source: 'Site web', at: ago(12) },
  { recruitId: 'REC-21', name: 'Koffi Mensah', email: 'koffi.mensah@exemple.africa', source: 'Cooptation', at: ago(9), status: 'Entretien', scores: { exp: 3, tech: 4, ent: 3, integ: 4, coop: 3, lang: 3 } },
]);
// Membres et inscriptions : 30 en attente, 120 décidées (noms fictifs), rapports mensuels en brouillon
const FN = ['Kossi', 'Ama', 'Yao', 'Awa', 'Kwame', 'Fatou', 'Ngozi', 'Moussa', 'Aïcha', 'Koffi', 'Mariam', 'Salif', 'Esther', 'Thabo', 'Wanjiru', 'Youssef', 'Grace', 'Ibrahim', 'Rose', 'Afi'];
const LN = ['Mensah', 'Diallo', 'Kouassi', 'Ndiaye', 'Asante', 'Eze', 'Traoré', 'Agbodjan', 'Ouédraogo', 'Mukamana', 'Nkosi', 'Kamau', 'Benali', 'Kane', 'Atieno', 'Lawson'];
const PAYS9 = ['TG', 'TG', 'TG', 'CI', 'SN', 'BJ', 'NG', 'GH', 'CM', 'KE', 'MA'];
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const ins = Array.from({ length: 150 }, (_, i) => {
  const country = pick(PAYS9); const d1 = pick(DK); const d2 = R() < 0.4 ? pick(DK) : d1;
  const pend = i < 30; const at = ago(pend ? (R() < 0.8 ? rint(2, 46) / 24 : rint(50, 110) / 24) : rint(5, 300));
  return { id: `MEM-${country}-${String(100000 + i)}`, name: `${pick(FN)} ${pick(LN)}`, phone: `+228 9${rint(0, 9)} ${rint(10, 99)} ${rint(10, 99)} ${rint(10, 99)}`, company: `${pick(['Agro', 'Bati', 'Tech', 'Santé', 'Kente'])}${pick(['plus', ' Services', ' SARL', ' Africa'])}`, country, domains: [...new Set([d1, d2])], source: R() < 0.7 ? 'Site web' : pick(['Événement', 'Ambassadeur', 'WhatsApp']), status: pend ? 'En attente' : R() < 0.92 ? 'Validée' : 'Rejetée', slaFrom: at, createdAt: at, decidedAt: pend ? null : new Date(at.getTime() + rint(4, 70) * 36e5) };
});
await db.insert(s.osInscription).values(ins);
// Domaines : actionnariat, projets, budgets d'événements, chantiers BTP et appels d'offres (contenus du prototype)
await db.insert(s.osCapital).values((['Manioc+ SA', 'AgroSahel', 'Kente Studio', 'BatiVert SARL', 'Sahel Dairy', 'AquaPure'] as const).map((name, k) => ({ name, country: ['TG', 'SN', 'CI', 'CI', 'BF', 'BJ'][k], stage: ["Recherche d'investisseurs", 'Valorisation', 'Sensibilisation', "Pacte d'associés", 'Valorisation', "Recherche d'investisseurs"][k], valuation: rint(3, 40) * 1e8, share: rint(10, 35) })));
await db.insert(s.osProject).values(([['Programme Agritech Sahel', 'ML', 'Fondation Partenaire (fictive)', 380e6], ['Incubateur numérique de Lomé', 'TG', 'Coopération (fictive)', 210e6], ['Forum panafricain 2026', 'TG', 'Sponsors privés', 160e6], ['Plateforme Diaspora Invest', 'SN', 'Banque de développement (fictive)', 95e6], ["Observatoire de l'emploi des jeunes", 'CI', 'Agence (fictive)', 70e6]] as const).map(([name, country, funder, budget], k) => ({ name, country, funder, budget, spent: Math.round(budget * (0.2 + R() * 0.6)), progress: rint(15, 85), health: ['ok', 'warn', 'ok', 'bad', 'ok'][k], milestones: [['Lancement', true], ['Rapport T2', k % 2 === 0], ['Évaluation à mi-parcours', false]] as [string, boolean][], next: ago(-rint(5, 60)) })));
await db.insert(s.osEventFin).values([{ eventId: 'e1', budget: 160e6, sponsors: 7, sponsorship: 120e6 }, { eventId: 'e2', budget: 4e6, sponsors: 1, sponsorship: 2e6 }, { eventId: 'e3', budget: 2.5e6, sponsors: 2, sponsorship: 0 }]);
const cond = P((r) => r.poste === 'C21' && r.country === 'TG');
const SITES: [string, string, string, string, number, number[][]][] = [
  ['CH-201', 'Centre de formation de Kara', 'TG', "Ministère de l'Enseignement technique (fictif)", 820e6, [[100, 1.0], [70, 1.02], [20, 0.95], [0, 0]]],
  ['CH-202', 'Marché moderne de Parakou', 'BJ', 'Commune de Parakou (fictive)', 1450e6, [[100, 0.98], [45, 1.12], [5, 1.0], [0, 0]]],
  ['CH-203', 'Logements sociaux Cité Verte', 'CI', 'Groupe Habitat Plus', 980e6, [[100, 1.0], [90, 0.97], [60, 1.01], [10, 1.0]]],
];
for (const [id, name, country, client, amount, prog] of SITES) {
  await db.insert(s.osSite).values({ id, name, country, client, amount, manager: cond, start: ago(rint(150, 400)), end: ago(-rint(90, 300)) });
  const { DEFAULT_LOTS } = await import('../src/lib/os/domaines');
  await db.insert(s.osSiteLot).values(DEFAULT_LOTS.map(([l, f], i) => { const budget = Math.round(amount * f * 0.85); return { siteId: id, name: l, budget, progress: prog[i][0], cost: Math.round((budget * prog[i][0] / 100) * prog[i][1]), position: i }; }));
}
await db.insert(s.osSiteStatement).values([{ siteId: 'CH-201', no: 1, progress: 20, amount: 164e6, at: ago(90) }, { siteId: 'CH-201', no: 2, progress: 40, amount: 164e6, at: ago(40) }]);
await db.insert(s.osSiteLog).values([{ siteId: 'CH-201', weather: 'Ensoleillé', workforce: 42, text: 'Coulage de la dalle du bâtiment B, réception de 300 sacs de ciment.', by: cond, at: ago(1) }, { siteId: 'CH-201', weather: 'Pluie', workforce: 18, text: 'Arrêt partiel l’après-midi ; mise à l’abri du matériel.', by: cond, at: ago(2) }]);
await db.insert(s.osSiteSub).values([{ siteId: 'CH-202', name: 'Électro Services (fictif)', lot: 'Second œuvre', amount: 86e6, paid: 30e6 }]);
await db.insert(s.osSiteHse).values([{ siteId: 'CH-202', text: 'Presque-accident — chute d’outil depuis l’échafaudage', at: ago(4) }]);
await db.insert(s.osTender).values([{ id: 'AO-26-031', object: "Construction d'un lycée technique", client: 'État (fictif)', country: 'TG', amount: 1.2e9, deadline: ago(-6), status: 'En étude', probability: 40 }, { id: 'AO-26-034', object: 'Pont de franchissement rural', client: 'Agence des routes (fictive)', country: 'BJ', amount: 640e6, deadline: ago(-18), status: 'Veille', probability: 25 }]);
console.log(`✓ ${rows.length} collaborateurs, budgets ${year} de ${DK.length} domaines. Comptes rattachés : admin@cea.demo (DG), analyste@cea.demo, editeur@cea.demo.`);
process.exit(0);
