/* Traductions anglaises des contenus affichés sur les pages traduites (accueil, etc.).
   Traduction assistée, à faire relire (CDC §5.4 : traduction assistée par IA avec relecture humaine). */
import { DOMAINS, ARTICLES, EVENTS, COURSES, JOBS, CONSULTS, POSITIONS, OPPS, PATHS } from '../data/site';
import type { Lang } from './ui';

const DOM: Record<string, { n?: string; dom: string; d: string; k: string }> = {
  actionnariat: { n: 'CEA Shareholding', dom: 'Shareholding', d: 'Understand, open up and share the capital of your company.', k: 'Equity studio and Shareholders’ Club' },
  levee: { dom: 'Fundraising', d: 'Prepare your raise and meet qualified investors.', k: 'Through CEA Kapital Invest' },
  projets: { dom: 'Project development', d: 'Turn a project into something fundable, from canvas to action plan.', k: 'Project Studio' },
  evenements: { dom: 'Events', d: 'Forums, masterclasses and business meetings across the continent.', k: 'Pan-African Forum on 26 November' },
  emploi: { dom: 'Job creation', d: 'Hire African talent and measure the jobs created.', k: '10 open offers' },
  mastermind: { dom: 'Mastermind group', d: 'Confidential circles of 8 to 12 leaders who help each other.', k: '14 active circles' },
  formation: { dom: 'Support and training', d: 'Certified courses, mentoring and acceleration programmes.', k: '8 online courses' },
  syndicat: { n: 'CEA Entrepreneurs’ Voice', dom: 'Advocacy', d: 'Carry entrepreneurs’ voices to decision-makers.', k: '3 open consultations' },
  btp: { n: 'CEA Construction & Infrastructure', dom: 'Construction and infrastructure', d: 'Construction, public works, housing and infrastructure: projects, tenders and partners.', k: 'Projects, tenders, partners' },
};
const ART: Record<string, { t: string; x: string; cat: string; c?: string }> = {
  a1: { t: 'Venture capital in Africa: what changes in 2026', x: 'African funds are turning to profitable companies and blended finance. What this means for founders preparing a raise.', cat: 'Analysis', c: 'Pan-African' },
  a2: { t: 'How Aïcha tripled her gari production in 18 months', x: 'From a family kitchen to a 46-employee processing unit: a journey supported by CEA.', cat: 'Entrepreneur story' },
  a3: { t: 'AfCFTA: rules of origin explained simply', x: 'To benefit from reduced customs duties, your products must meet the rules of origin. Here is how to read them.', cat: 'Guide', c: 'Pan-African' },
  a4: { t: 'Press release: launch of CEA Kapital Invest', x: 'CEA FOR AFRICA launches its financial portal dedicated to fundraising and access to African capital markets.', cat: 'Press release', c: 'Pan-African' },
  a5: { t: 'BRVM: understanding SME listings', x: 'The SME segment opens a still underused financing route. Conditions, costs and timeline.', cat: 'Analysis', c: 'WAEMU' },
};
const EV: Record<string, { t: string; city?: string; fmt: string }> = {
  e1: { t: 'CEA Pan-African Forum 2026', fmt: 'Hybrid' },
  e2: { t: 'Masterclass: raising your first million', fmt: 'In person' },
  e3: { t: 'Investor meetings — Agritech', city: 'Online', fmt: 'Online' },
  e4: { t: 'Workshop: WhatsApp Business to sell more', fmt: 'In person' },
  e5: { t: 'Women entrepreneurs circle', fmt: 'In person' },
};
const CO: Record<string, string> = {
  c1: 'Starting a business in the OHADA area', c2: 'Building a convincing financial model', c3: 'Pitching to investors', c4: 'Selling across Africa with the AfCFTA',
  c5: 'Digital marketing on a small budget', c6: 'Opening up your SME’s capital', c7: 'Hiring and retaining your first employees', c8: 'Understanding the BRVM stock exchange',
};
const JOB: Record<string, { t: string; type?: string }> = {
  j1: { t: 'Sales manager, West Africa', type: 'Permanent' }, j2: { t: 'Flutter mobile developer', type: 'Permanent' }, j3: { t: 'Internship — financial analyst', type: 'Internship' },
  j4: { t: 'Solar energy project manager', type: 'Fixed-term' }, j5: { t: 'Bilingual community manager' }, j6: { t: 'Senior SYSCOHADA accountant', type: 'Permanent' },
  j7: { t: 'Logistics manager', type: 'Permanent' }, j8: { t: 'Data analyst', type: 'Permanent' }, j9: { t: 'Internship — events officer', type: 'Internship' }, j10: { t: 'Project structuring consultant' },
};
const CONS: Record<string, { t: string; c: string; o: string[] }> = {
  v1: { t: 'What should the 2027 advocacy priority be?', c: 'All countries', o: ['Payment delays on public contracts', 'SME access to bank credit', 'Taxation of young companies', 'Cost of energy'] },
};
const POS: Record<number, string> = { 0: 'For a 60-day cap on public payment delays' };
const OPP: Record<string, { n: string; s: string; st: string; inst: string; ver: string }> = {
  o1: { n: '“Manioc+” project', s: 'Agro-industry', st: 'Growth', inst: 'Preferred shares', ver: 'Verified by CEA' },
  o2: { n: '“PayLink” project', s: 'Fintech', st: 'Seed', inst: 'SAFE / BSA AIR', ver: 'Verified by CEA' },
  o3: { n: '“SolarVillage” project', s: 'Energy', st: 'Series A', inst: 'Equity + debt', ver: 'Due diligence in progress' },
};
const PATH: Record<string, { t: string; d: string }> = {
  pa1: { t: '“Certified Entrepreneur” path', d: 'The basics to create and run a viable business.' },
  pa2: { t: '“Ready to Raise” path', d: 'Everything to prepare a serious fundraising.' },
};

/** Fusionne les traductions anglaises si lang = en. */
export function tr(lang: Lang) {
  const en = lang === 'en';
  return {
    domains: DOMAINS.map((d) => (en && DOM[d.id] ? { ...d, ...DOM[d.id] } : d)),
    articles: ARTICLES.map((a) => (en && ART[a.id] ? { ...a, ...ART[a.id] } : a)),
    events: EVENTS.map((e) => (en && EV[e.id] ? { ...e, ...EV[e.id] } : e)),
    courses: COURSES.map((c) => (en && CO[c.id] ? { ...c, t: CO[c.id] } : c)),
    jobs: JOBS.map((j) => (en && JOB[j.id] ? { ...j, ...JOB[j.id] } : j)),
    consults: CONSULTS.map((v) => (en && CONS[v.id] ? { ...v, t: CONS[v.id].t, c: CONS[v.id].c, o: v.o.map((o, i) => [CONS[v.id].o[i] ?? o[0], o[1]]) } : v)),
    positions: POSITIONS.map((p, i) => (en && POS[i] ? { ...p, t: POS[i] } : p)),
    opps: OPPS.map((o) => (en && OPP[o.id] ? { ...o, ...OPP[o.id] } : o)),
    paths: PATHS.map((p) => (en && PATH[p.id] ? { ...p, ...PATH[p.id] } : p)),
  };
}
