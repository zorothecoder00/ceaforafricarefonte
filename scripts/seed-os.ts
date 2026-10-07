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
const { eq, sql, inArray } = await import('drizzle-orm');
const { PDOM, DOM, BANDS, gradeOf, profOf, pn, DK } = await import('../src/lib/os/ref');

if (process.argv.includes('--reset')) {
  await db.execute(sql`truncate os_message, os_channel_seen, os_channel, os_meeting, os_task, os_decision, os_request, os_delegation, os_timesheet, os_budget, staff restart identity cascade`);
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
console.log(`✓ ${rows.length} collaborateurs, budgets ${year} de ${DK.length} domaines. Comptes rattachés : admin@cea.demo (DG), analyste@cea.demo, editeur@cea.demo.`);
process.exit(0);
