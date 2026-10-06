/* Interactions globales du site (thème, menu, devise, carte, votes, Copilot, recherche…). */
import { norm, search as fuzzySearch } from '../lib/fuzzy';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

function store(k: string, v?: string | null) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
  return null;
}

export function toast(t: string) {
  const e = $('#toast') as HTMLElement & { _t?: number };
  if (!e) return;
  e.textContent = t;
  e.classList.add('on');
  clearTimeout(e._t);
  e._t = window.setTimeout(() => e.classList.remove('on'), 3400);
}
(window as any).toast = toast;

/* ===== préférences d'affichage ===== */
const root = document.documentElement;
$('#themeBtn')?.addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  store('cea-theme', root.dataset.theme);
});
$('#fsBtn')?.addEventListener('click', () => {
  const sizes = [17, 19, 21];
  const cur = parseInt(store('cea-fs') || '17', 10);
  const next = sizes[(sizes.indexOf(cur) + 1) % sizes.length];
  root.style.setProperty('--fs', next + 'px');
  store('cea-fs', String(next));
  toast((EN ? 'Text size: ' : 'Taille du texte : ') + next + 'px');
});
const liteBtn = $('#liteBtn');
liteBtn?.setAttribute('aria-pressed', String(root.classList.contains('lite')));
liteBtn?.addEventListener('click', () => {
  const on = root.classList.toggle('lite');
  store('cea-lite', on ? '1' : null);
  liteBtn.setAttribute('aria-pressed', String(on));
  toast(on ? (EN ? 'Lite mode on: animations, maps and videos hidden.' : 'Mode Lite activé : animations, cartes et vidéos masquées.') : (EN ? 'Lite mode off.' : 'Mode Lite désactivé.'));
});

/* ===== langue courante ===== */
const LANG = document.documentElement.lang === 'en' ? 'en' : 'fr';
const EN = LANG === 'en';

/* Menu latéral (back-office, Mon espace) : largeur normale ou réduite (liens toujours visibles), choix mémorisé sur cet appareil */
const sideBtn = $<HTMLButtonElement>('[data-side-toggle]');
if (sideBtn) {
  const sync = () => {
    const min = root.classList.contains('side-min');
    sideBtn.setAttribute('aria-pressed', String(min));
    sideBtn.title = min ? (EN ? 'Show the menu labels' : 'Afficher les libellés du menu') : (EN ? 'Collapse to icons' : 'Réduire le menu aux icônes');
    sideBtn.setAttribute('aria-label', sideBtn.title);
  };
  sync();
  sideBtn.addEventListener('click', () => {
    root.classList.toggle('side-min');
    store('cea-side', root.classList.contains('side-min') ? 'min' : null);
    sync();
  });
}
const withLang = (p: string) => (EN && p.startsWith('/') && !p.startsWith('/en/') ? '/en' + p : p);

/* ===== méga-menus (CDC §5.3) ===== */
const megaBtns = $$<HTMLButtonElement>('[data-mega]');
function closeMegas(except?: HTMLButtonElement) {
  megaBtns.forEach((b) => {
    if (b === except) return;
    b.setAttribute('aria-expanded', 'false');
    document.getElementById(b.getAttribute('aria-controls')!)?.classList.remove('open');
  });
}
function openMega(b: HTMLButtonElement, open: boolean) {
  closeMegas(b);
  b.setAttribute('aria-expanded', String(open));
  document.getElementById(b.getAttribute('aria-controls')!)?.classList.toggle('open', open);
}
megaBtns.forEach((b) => {
  b.addEventListener('click', () => openMega(b, b.getAttribute('aria-expanded') !== 'true'));
  // Survol : bascule d'un panneau à l'autre quand un panneau est déjà ouvert
  b.addEventListener('mouseenter', () => { if (megaBtns.some((x) => x !== b && x.getAttribute('aria-expanded') === 'true')) openMega(b, true); });
});
document.addEventListener('click', (e) => {
  const tgt = e.target as Element;
  if (!tgt.closest('[data-mega]') && !tgt.closest('.mega')) closeMegas();
  if (!tgt.closest('.loc')) closeLoc();
});

/* ===== menu mobile (tiroir) ===== */
const menuBtn = $('#menuBtn'), drawer = $('#drawer');
function setDrawer(open: boolean) {
  drawer?.classList.toggle('open', open);
  menuBtn?.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) $<HTMLButtonElement>('#drawerClose')?.focus();
}
menuBtn?.addEventListener('click', () => setDrawer(true));
$('#drawerClose')?.addEventListener('click', () => { setDrawer(false); menuBtn?.focus(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeMegas(); closeLoc();
  if (drawer?.classList.contains('open')) { setDrawer(false); menuBtn?.focus(); }
});

/* ===== pays · langue · devise ===== */
type Cur = { code: string; perEur: number; symbol?: string };
const CURS: Cur[] = JSON.parse($('#currencies')?.textContent || '[]');
const COUNTRY_CUR: Record<string, string> = JSON.parse($('#countryCur')?.textContent || '{}');
const locBtn = $('[data-loc-btn]'), locPop = locBtn ? document.getElementById(locBtn.getAttribute('aria-controls')!) : null;
function closeLoc() { if (locPop) locPop.hidden = true; locBtn?.setAttribute('aria-expanded', 'false'); }
locBtn?.addEventListener('click', () => {
  const open = !!locPop?.hidden;
  if (locPop) locPop.hidden = !open;
  locBtn.setAttribute('aria-expanded', String(open));
});
const pref = { country: store('cea-country') || '', cur: store('cea-cur') || '' };
if (!CURS.some((c) => c.code === pref.cur)) pref.cur = COUNTRY_CUR[pref.country] || 'XOF';

function fmtMoney(xof: number, code: string) {
  const c = CURS.find((x) => x.code === code) || CURS[0];
  const v = (xof / 655.957) * c.perEur;
  const loc = EN ? 'en-GB' : 'fr-FR';
  if (c.symbol) return Math.round(v).toLocaleString(loc) + ' ' + c.symbol;
  return v.toLocaleString(loc, { style: 'currency', currency: c.code, maximumFractionDigits: v < 100 ? 2 : 0 });
}
function applyPrefs() {
  $$('.money').forEach((el) => {
    const xof = Number(el.dataset.xof);
    el.textContent = xof ? fmtMoney(xof, pref.cur) : el.dataset.free || (EN ? 'Free' : 'Gratuit');
    if (xof && pref.cur !== 'XOF') el.title = `${Math.round(xof).toLocaleString('fr-FR')} FCFA — ${EN ? 'indicative conversion, rate of 30/09/2026' : 'conversion indicative, taux du 30/09/2026'}`;
  });
  $$<HTMLSelectElement>('[data-loc="country"]').forEach((s) => (s.value = pref.country));
  $$<HTMLSelectElement>('[data-loc="cur"]').forEach((s) => (s.value = pref.cur));
  const sym = CURS.find((c) => c.code === pref.cur)?.symbol?.split(' ')[0] || pref.cur;
  $$('[data-loc-txt]').forEach((el) => (el.textContent = `${pref.country ? pref.country + ' · ' : ''}${LANG.toUpperCase()} · ${sym}`));
}
$$<HTMLSelectElement>('[data-loc="country"]').forEach((s) => s.addEventListener('change', () => {
  pref.country = s.value;
  store('cea-country', s.value || null);
  if (COUNTRY_CUR[s.value]) { pref.cur = COUNTRY_CUR[s.value]; store('cea-cur', pref.cur); }
  applyPrefs();
}));
$$<HTMLSelectElement>('[data-loc="cur"]').forEach((s) => s.addEventListener('change', () => { pref.cur = s.value; store('cea-cur', s.value); applyPrefs(); }));
$$<HTMLSelectElement>('[data-loc="lang"]').forEach((s) => s.addEventListener('change', () => {
  const path = location.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  location.href = (s.value === 'en' ? (path === '/' ? '/en/' : '/en' + path) : path) + location.search + location.hash;
}));
applyPrefs();

/* ===== carte de l'Afrique : survol = chiffres, clic = page pays (CDC §6.1) ===== */
$$('[data-map]').forEach((map) => {
  const hubs = JSON.parse(map.dataset.hubs || '[]');
  const card = $('.map-card', map);
  $$('.hub', map).forEach((g) => {
    const h = hubs[Number(g.dataset.i)];
    const show = () => {
      $$('.hub', map).forEach((x) => x.classList.remove('on'));
      g.classList.add('on');
      if (card && h) card.innerHTML = `<h4>${h.name}${h.hq ? ` <span class="tag gold">${EN ? 'HQ' : 'Siège'}</span>` : ''}</h4><div class="kv"><span>${EN ? 'Members' : 'Membres'}</span><b>${h.m}</b><span>${EN ? 'Projects supported' : 'Projets accompagnés'}</span><b>${h.p}</b><span>${EN ? 'Events in 2026' : 'Événements en 2026'}</span><b>${h.e}</b></div><a class="small" style="color:#082B4C;font-weight:700" href="${withLang('/pays/' + h.code)}">${EN ? 'Country page' : 'Page pays'}</a>`;
    };
    // Sans encart (page pays), le clic ouvre la page du pays ; avec encart, il l'affiche comme au survol
    const go = () => { if (card) show(); else location.href = withLang('/pays/' + h.code); };
    g.addEventListener('mouseenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
});

/* ===== compteurs animés (respectent « moins d'animations » et le mode Lite) ===== */
const counters = $$('[data-countup]');  // data-count (sans « up ») sert ailleurs aux compteurs de caractères et de résultats
if (counters.length) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('lite');
  const run = (el: HTMLElement) => {
    const end = Number(el.dataset.countup), suffix = el.dataset.suffix || '';
    const out = (n: number) => (el.textContent = Math.round(n).toLocaleString(EN ? 'en-GB' : 'fr-FR') + suffix);
    if (reduce) return out(end);
    const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 1400); out(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { run(e.target as HTMLElement); io.unobserve(e.target); } }), { threshold: 0.4 });
  counters.forEach((c) => io.observe(c));
}

/* ===== compte à rebours ===== */
$$('[data-countdown]').forEach((el) => {
  const target = new Date(el.dataset.countdown!).getTime();
  const tick = () => {
    const d = target - Date.now();
    if (d <= 0) { el.innerHTML = '<div><b>0</b><span>Clôturé</span></div>'; return; }
    const j = Math.floor(d / 864e5), h = Math.floor(d / 36e5) % 24, m = Math.floor(d / 6e4) % 60;
    el.innerHTML = `<div><b>${j}</b><span>jours</span></div><div><b>${h}</b><span>heures</span></div><div><b>${m}</b><span>minutes</span></div>`;
  };
  tick();
  setInterval(tick, 30000);
});

/* ===== consultations (votes) : une voix par adhérent, résultats lus en base (/api/votes) ===== */
const voteBoxes = $$('[data-vote]');
if (voteBoxes.length) {
  const draw = (box: HTMLElement, counts: number[], chosen?: number) => {
    const opts = $$<HTMLButtonElement>('.vote-opt', box);
    const total = counts.reduce((a, b) => a + b, 0);
    opts.forEach((b, i) => {
      const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
      if (chosen !== undefined) { ($('.bar', b) as HTMLElement).style.width = pct + '%'; $('.pct', b)!.textContent = pct + ' %' + (i === chosen ? ' ✓' : ''); }
      b.disabled = chosen !== undefined;
    });
    $('.vote-total', box)!.textContent = total.toLocaleString('fr-FR');
  };
  const load = () => fetch('/api/votes?ids=' + voteBoxes.map((b) => b.dataset.vote).join(','), { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null);
  load().then((d) => {
    if (!d) return;
    voteBoxes.forEach((box) => {
      const id = box.dataset.vote!;
      if (d.counts[id]) draw(box, d.counts[id], d.mine[id]);
      $$<HTMLButtonElement>('.vote-opt', box).forEach((b, i) => b.addEventListener('click', async () => {
        if (!d.logged) { location.href = (EN ? '/en' : '') + '/connexion?retour=' + encodeURIComponent(location.pathname); return; }
        const r = await fetch('/api/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consultationId: id, option: i }) });
        const res = await r.json().catch(() => ({}));
        toast(res.message || res.error || 'Erreur.');
        const nd = await load();
        if (nd?.counts[id]) draw(box, nd.counts[id], nd.mine[id]);
      }));
    });
  });
}

/* ===== partage (API Web Share, sinon copie du lien) ===== */
$$<HTMLButtonElement>('[data-share]').forEach((b) => b.addEventListener('click', async () => {
  const data = { title: b.dataset.share || document.title, url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); toast(EN ? 'Link copied.' : 'Lien copié.'); }
  } catch { /* partage annulé */ }
}));

/* ===== boutons et formulaires de démonstration ===== */
$$('[data-toast]').forEach((b) => b.addEventListener('click', () => toast(b.dataset.toast!)));
$$<HTMLFormElement>('form[data-demo]').forEach((f) => f.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!f.checkValidity()) { f.reportValidity(); return; }
  toast(f.dataset.demo!);
  f.reset();
}));
$$('[data-slots]').forEach((g) => $$('.slot', g).forEach((s) => s.addEventListener('click', () => {
  $$('.slot', g).forEach((x) => x.setAttribute('aria-pressed', 'false'));
  s.setAttribute('aria-pressed', 'true');
})));

/* ===== recherche universelle (Ctrl+K ou « / ») ===== */
type Entry = { t: string; d: string; h: string; ty: string; c?: string; s?: string; dt?: string };
const index: Entry[] = JSON.parse($('#searchIndex')?.textContent || '[]');
const dlg = $<HTMLDialogElement>('#dlg');
const sq = $<HTMLInputElement>('#sq'), sres = $('#sres');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
// Filtre par type (Page, Cours, Événement…) : une puce par type présent dans l'index
let sType = '';
const sfil = $('#sfil');
const fillTypes = () => { if (sfil) sfil.innerHTML = ['', ...new Set(index.map((x) => x.ty))].map((ty) => `<button type="button" class="chip" data-ty="${esc(ty)}" aria-pressed="${ty === sType}">${ty ? esc(ty) : EN ? 'All' : 'Tout'}</button>`).join(''); };
if (sfil) {
  fillTypes();
  sfil.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-ty]');
    if (!b) return;
    sType = b.dataset.ty!;
    $$('[data-ty]', sfil).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    runSearch(); sq!.focus();
  });
}
// Filtres pays, secteur (ou thème) et date : listes construites à partir des valeurs présentes dans l'index
const sCountry = $<HTMLSelectElement>('#sCountry'), sSector = $<HTMLSelectElement>('#sSector'), sDate = $<HTMLSelectElement>('#sDate');
const fillSelect = (sel: HTMLSelectElement | null, all: string, vals: (string | undefined)[]) => {
  if (sel) sel.innerHTML = `<option value="">${all}</option>` + [...new Set(vals.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'fr')).map((v) => `<option>${esc(v)}</option>`).join('');
};
const fillFilters = () => {
  fillSelect(sCountry, EN ? 'All countries' : 'Tous les pays', index.map((x) => x.c));
  fillSelect(sSector, EN ? 'All sectors and topics' : 'Tous les secteurs et thèmes', index.map((x) => x.s));
};
fillFilters();
[sCountry, sSector, sDate].forEach((s) => s?.addEventListener('change', runSearch));
// Contenus publiés du CMS (articles, événements, cours, pages) : chargés à la première ouverture ; ils remplacent l'entrée de même lien
let cmsLoaded = false;
async function loadCmsIndex() {
  if (cmsLoaded) return;
  cmsLoaded = true;
  const d = await fetch(`/api/recherche?lang=${EN ? 'en' : 'fr'}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { entries: Entry[] } | null;
  if (!d?.entries.length) return;
  const hrefs = new Set(d.entries.map((x) => x.h));
  const kept = index.filter((x) => !hrefs.has(x.h));
  index.splice(0, index.length, ...kept, ...d.entries);
  fillTypes(); fillFilters();
  if (dlg?.open) runSearch();
}
function dateOk(dt: string | undefined, f: string) {
  if (!f) return true;
  if (!dt) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (f === 'next') return dt >= today;
  return dt <= today && dt >= new Date(Date.now() - Number(f) * 864e5).toISOString().slice(0, 10);
}
function runSearch() {
  const q = norm(sq!.value.trim());
  const fc = sCountry?.value ?? '', fs = sSector?.value ?? '', fd = sDate?.value ?? '';
  const filtered = !!(fc || fs || fd);
  if (!q && !filtered) { sres!.innerHTML = `<p class="small muted">${EN ? 'Type at least one letter, or choose a filter. Tip: Ctrl+K or / opens search anywhere.' : 'Tapez au moins une lettre ou choisissez un filtre. Astuce : Ctrl+K ou / ouvre la recherche partout.'}</p>`; return; }
  const seen = new Set<string>();
  const pool = index.filter((x) => (!sType || x.ty === sType) && (!fc || x.c === fc) && (!fs || x.s === fs) && dateOk(x.dt, fd) && !seen.has(x.ty + x.t) && seen.add(x.ty + x.t));
  // Avec du texte : tolérante aux fautes et classée par pertinence (titre prioritaire) ; sans texte : tout ce qui passe les filtres, par date
  const res = q ? fuzzySearch(pool, q, (x) => [x.t, x.d], 12)
    : pool.sort((a, b) => (fd === 'next' ? (a.dt ?? '').localeCompare(b.dt ?? '') : (b.dt ?? '').localeCompare(a.dt ?? ''))).slice(0, 30);
  sres!.innerHTML = res.length
    ? res.map((x) => `<a href="${x.h}"><span class="tag info">${esc(x.ty)}</span><span><b>${esc(x.t)}</b><br><span class="small muted">${esc(x.d)}</span></span></a>`).join('')
    : `<div class="empty">${EN ? 'No results. Try another word or ask CEA Copilot.' : 'Aucun résultat. Essayez un autre mot ou demandez à CEA Copilot.'}</div>`;
}
function openSearch() { closeMegas(); dlg?.showModal(); loadCmsIndex(); sq!.value = ''; [sCountry, sSector, sDate].forEach((s) => { if (s) s.value = ''; }); runSearch(); sq!.focus(); }
sq?.addEventListener('input', runSearch);
$('#searchBtn')?.addEventListener('click', openSearch);
$('#dlgClose')?.addEventListener('click', () => dlg?.close());
document.addEventListener('keydown', (e) => {
  const typing = (e.target as Element).closest('input, textarea, select, [contenteditable]');
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !dlg?.open)) { e.preventDefault(); openSearch(); }
});

/* ===== CEA Copilot ===== */
const chat = $('#chat'), fab = $('#fab'), body = $('#chatBody'), input = $<HTMLInputElement>('#chatIn');
function setChat(open: boolean) {
  chat?.classList.toggle('open', open);
  fab?.setAttribute('aria-expanded', String(open));
  if (open) input?.focus();
}
(window as any).openChat = () => setChat(true);
fab?.addEventListener('click', () => setChat(!chat?.classList.contains('open')));
$('#chatClose')?.addEventListener('click', () => setChat(false));

const RULES: [RegExp, string, string][] = [
  [/lev|fonds|financ|investor ready|raise|fund/, 'Pour préparer une levée : commencez par le diagnostic gratuit « Suis-je prêt ? » (8 questions) → /kapital/diagnostic. Ensuite, le programme Investor Ready vous accompagne pendant 10 semaines.', 'To prepare a raise, start with the free “Am I ready?” diagnostic (8 questions) → /kapital/diagnostic. The Investor Ready programme then supports you for 10 weeks.'],
  [/invest|opportunit/, 'Les opportunités vérifiées par nos analystes sont sur /kapital/opportunites. Pour accéder aux dossiers complets, créez votre profil investisseur : /kapital/devenir-investisseur. Rappel : investir comporte un risque de perte en capital.', 'Opportunities verified by our analysts are at /kapital/opportunites. To access full files, create your investor profile: /kapital/devenir-investisseur. Investing carries a risk of capital loss.'],
  [/cours|formation|gratuit|acad|course|free|learn/, "CEA Academy propose 8 cours, dont 4 gratuits : « Créer son entreprise dans l'espace OHADA », « Pitcher devant des investisseurs », « Marketing digital à petit budget »… → /academie", 'CEA Academy offers 8 courses, 4 of them free (company creation in the OHADA area, pitching to investors, digital marketing on a budget…) → /academie'],
  [/event|forum|agenda/, 'Prochain grand rendez-vous : le Forum panafricain CEA 2026, du 26 au 28 novembre à Lomé, avec un Demo Day devant 40 investisseurs → /evenements/e1', 'Next big event: the CEA Pan-African Forum 2026, 26–28 November in Lomé, with a Demo Day in front of 40 investors → /evenements/e1'],
  [/emploi|job|stage|recrut|intern|hire/, "10 offres d'emploi et de stage vérifiées sont en ligne → /opportunites", '10 verified job and internship offers are online → /opportunites'],
  [/bourse|brvm|march|exchange|stock/, 'Suivez la BRVM, la JSE, la NGX, la NSE et les autres places africaines sur /kapital/marches.', 'Follow the BRVM, JSE, NGX, NSE and other African exchanges at /kapital/marches.'],
  [/programme|program|accel|incub|candidat|apply/, "L'Accélérateur — Cohorte 4 est ouvert jusqu'au 15 novembre 2026 : six mois d'accompagnement et un Demo Day → /programmes", 'The Accelerator — Cohort 4 is open until 15 November 2026: six months of support and a Demo Day → /programmes'],
  [/contact|aide|support|help/, 'Écrivez-nous depuis /contact : votre message est transmis directement à la bonne équipe dans votre pays.', 'Write to us at /contact: your message goes straight to the right team in your country.'],
  [/commencer|start|perdu|lost/, 'Pas sûr de savoir par où commencer ? Choisissez votre profil sur /commencer.', 'Not sure where to start? Choose your profile at /commencer.'],
];
type Source = { n: number; title: string; url: string; kind: string };
let said = 0; // numéro de réponse, pour des ancres de sources uniques
function say(text: string, who: 'u' | 'a', ai?: { sources: Source[] }) {
  const m = document.createElement('div');
  m.className = 'msg ' + who;
  if (who === 'a') {
    const k = String(++said);
    m.innerHTML = esc(text).replace(/(\/[a-z0-9/-]+)/g, (p) => `<a href="${withLang(p)}">${withLang(p)}</a>`)
      .replace(/\[(\d+)\]/g, (s, n) => (ai?.sources.some((x) => x.n === Number(n)) ? `<sup><a href="#src-${k}-${n}" aria-label="Source ${n}">[${n}]</a></sup>` : s));
    // Gouvernance de l'IA (CDC §11) : réponse signalée comme générée par IA, avec ses sources
    if (ai) {
      m.insertAdjacentHTML('beforeend', (ai.sources.length ? `<span class="msg-src">Sources : ${ai.sources.map((s) => `<a id="src-${k}-${s.n}" href="${withLang(s.url)}" title="${esc(s.kind)}">[${s.n}] ${esc(s.title)}</a>`).join(' · ')}</span>` : '')
        + `<span class="msg-ai">${EN ? 'AI-generated answer — check important information.' : 'Réponse générée par IA — vérifiez les informations importantes.'} <a href="${withLang('/ia')}">${EN ? 'About AI at CEA' : "L'IA chez CEA"}</a></span>`);
    }
  } else m.textContent = text;
  body?.appendChild(m);
  body!.scrollTop = body!.scrollHeight;
}
// Historique envoyé à l'IA (/api/copilot) ; sans clé d'API côté serveur, repli sur les réponses par mots-clés
const history: { role: 'user' | 'assistant'; content: string }[] = [];
function ruleAnswer(q: string) {
  const hit = RULES.find(([r]) => r.test(norm(q)));
  return hit ? hit[EN ? 2 : 1] : EN ? "I don't have an answer to that yet. Try search (Ctrl+K) or write to the team via /contact." : "Je n'ai pas encore la réponse à cette question. Essayez la recherche (Ctrl+K) ou écrivez à l'équipe via /contact.";
}
async function answer(q: string) {
  say(q, 'u');
  history.push({ role: 'user', content: q });
  const wait = document.createElement('div');
  wait.className = 'msg a';
  wait.style.minWidth = '60%';
  wait.innerHTML = `<span class="skel w80" aria-hidden="true"></span><span class="skel w60" aria-hidden="true"></span><span class="sr">${EN ? 'Writing the answer…' : 'Réponse en cours…'}</span>`;
  body?.appendChild(wait);
  let reply = '', sources: Source[] | undefined;
  try {
    // L'historique commence toujours par une question de l'utilisateur
    const h = history.slice(-10);
    const r = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: h[0]?.role === 'assistant' ? h.slice(1) : h, lang: EN ? 'en' : 'fr' }) });
    const d = await r.json();
    if (d.ok && d.reply) { reply = d.reply; sources = d.sources ?? []; }
  } catch { /* hors ligne : réponses locales */ }
  wait.remove();
  if (!reply) reply = ruleAnswer(q);
  history.push({ role: 'assistant', content: reply.replace(/\[\d+\]/g, '') });
  say(reply, 'a', sources ? { sources } : undefined);
}
$('#chatForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input!.value.trim();
  if (!v) return;
  input!.value = '';
  answer(v);
});
$$('#sugg button').forEach((b) => b.addEventListener('click', () => answer(b.textContent || '')));

/* ===== rédaction assistée (CDC §11) : <textarea data-ai="projet|pitch|offre|candidature" [data-ai-form="id du formulaire source"]>
   Le texte proposé s'affiche à part : la personne choisit de remplacer, d'ajouter à la suite ou d'ignorer. ===== */
$$<HTMLTextAreaElement>('textarea[data-ai]').forEach((ta) => {
  if (ta.readOnly || ta.disabled) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-sm';
  btn.style.margin = '4px 0 10px';
  btn.textContent = EN ? '✨ Writing help (AI)' : '✨ Aide à la rédaction (IA)';
  const box = document.createElement('div');
  box.className = 'panel ai-draft';
  box.hidden = true;
  ta.after(btn, box);
  const label = () => ta.dataset.aiLabel || (ta.id && $(`label[for="${ta.id}"]`)?.textContent?.trim()) || ta.getAttribute('aria-label') || ta.name;
  btn.addEventListener('click', async () => {
    const src = (ta.dataset.aiForm ? document.getElementById(ta.dataset.aiForm) : ta.closest('form')) as HTMLFormElement | null;
    const fields: Record<string, string> = {};
    src?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[name], textarea[name], select[name]').forEach((el) => {
      if (el instanceof HTMLInputElement && ['password', 'file', 'hidden', 'checkbox', 'radio'].includes(el.type)) return;
      const v = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent ?? '' : el.value;
      if (v.trim()) fields[el.name] = v.slice(0, 6000);
    });
    btn.disabled = true;
    btn.textContent = EN ? 'Writing…' : 'Rédaction en cours…';
    const r = await fetch('/api/redaction', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: ta.dataset.ai, field: ta.name, label: label(), current: ta.value, fields, lang: EN ? 'en' : 'fr' }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    btn.disabled = false;
    btn.textContent = EN ? '✨ Writing help (AI)' : '✨ Aide à la rédaction (IA)';
    if (r?.status === 401) { toast(EN ? 'Sign in to use writing help.' : "Connectez-vous pour utiliser l'aide à la rédaction."); return; }
    if (!d.ok) { toast(d.error ?? (EN ? 'Network error.' : 'Erreur réseau.')); return; }
    box.hidden = false;
    box.innerHTML = `<p class="xs muted" style="margin:0 0 6px">${EN ? 'AI suggestion — read and adapt it. Text in [brackets] is for you to complete.' : 'Proposition générée par IA — relisez-la et adaptez-la. Les passages entre [crochets] sont à compléter.'}</p>
      <div class="small" style="white-space:pre-wrap"></div>
      <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
        <button type="button" class="btn btn-primary btn-sm" data-act="replace">${ta.value.trim() ? (EN ? 'Replace my text' : 'Remplacer mon texte') : (EN ? 'Use this text' : 'Utiliser ce texte')}</button>
        ${ta.value.trim() ? `<button type="button" class="btn btn-ghost btn-sm" data-act="append">${EN ? 'Add after my text' : 'Ajouter à la suite'}</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-act="close">${EN ? 'Dismiss' : 'Ignorer'}</button>
      </div>`;
    box.querySelector('div')!.textContent = d.draft;
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'replace') ta.value = d.draft;
      if (b.dataset.act === 'append') ta.value = `${ta.value.trimEnd()}\n\n${d.draft}`;
      if (b.dataset.act !== 'close') { ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); }
      box.hidden = true;
    }));
  });
});

/* ===== application installable (PWA) : service worker en production uniquement ===== */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* ===== Core Web Vitals de terrain (CDC §13.1) : un visiteur sur quatre, en production, envoi anonyme à la fermeture de la page ===== */
if (import.meta.env.PROD && 'PerformanceObserver' in window && Math.random() < 0.25) {
  const vals: Record<string, number> = {};
  const watch = (type: string, cb: (e: PerformanceEntry) => void, extra: Record<string, unknown> = {}) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...extra } as PerformanceObserverInit); } catch {}
  };
  // LCP : dernier plus grand élément affiché avant la première interaction
  watch('largest-contentful-paint', (e) => { vals.LCP = e.startTime; });
  // CLS : plus grande fenêtre de décalages (1 s entre décalages, 5 s au plus), hors décalages dus à une saisie
  let win = 0, first = 0, last = 0;
  watch('layout-shift', (e) => {
    const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (s.hadRecentInput) return;
    if (win && s.startTime - last < 1000 && s.startTime - first < 5000) win += s.value; else { win = s.value; first = s.startTime; }
    last = s.startTime;
    vals.CLS = Math.max(vals.CLS ?? 0, win);
  });
  // INP (approché) : la plus longue interaction observée, de l'événement au rendu suivant
  watch('event', (e) => { const t = e as PerformanceEntry & { interactionId?: number }; if (t.interactionId) vals.INP = Math.max(vals.INP ?? 0, t.duration); }, { durationThreshold: 16 });
  let sent = false;
  const send = () => {
    const m = Object.entries(vals).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, Math.round(k === 'CLS' ? v * 1000 : v) / (k === 'CLS' ? 1000 : 1)]);
    if (sent || !m.length) return;
    sent = true;
    const mob = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
    navigator.sendBeacon?.('/api/mesures', new Blob([JSON.stringify({ p: location.pathname, m, mob, lite: document.body.classList.contains('lite') })], { type: 'application/json' }));
  };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); });
  addEventListener('pagehide', send);
}

/* ===== état de connexion dans l'en-tête (pages statiques) ===== */
fetch('/api/moi', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : null))
  .then((d: { user: { name: string } | null; unread?: number } | null) => {
    const inside = !!d?.user;
    $$('[data-auth="out"]').forEach((el) => (el.hidden = inside));
    $$('[data-auth="in"]').forEach((el) => (el.hidden = !inside));
    if (!d?.user) return;
    const first = d.user.name.split(' ')[0];
    $$('[data-username]').forEach((el) => (el.textContent = first.length > 14 ? (EN ? 'My space' : 'Mon espace') : first));
    const n = d.unread ?? 0;
    $$('[data-unread]').forEach((el) => { el.hidden = n === 0; el.textContent = n > 9 ? '9+' : String(n); });
  })
  .catch(() => {});
$$('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  location.href = EN ? '/en/' : '/';
}));

/* ===== formulaires branchés sur l'API (data-api) =====
   <form data-api="/api/xxx" [data-method="PUT"] [data-success="…"] [data-reset] [data-reload] [data-redirect="/…"]>
   - champs nommés → JSON ; cases à cocher avec value partageant un nom → tableau ; case sans value → booléen ;
   - input[type=number] ou data-type="number" → nombre ; data-type="list" → liste séparée par des virgules. */
function formJson(f: HTMLFormElement) {
  const out: Record<string, unknown> = {};
  const els = [...f.elements] as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
  const groups = new Set(els.filter((e) => e instanceof HTMLInputElement && e.type === 'checkbox' && e.hasAttribute('value')).map((e) => e.name));
  for (const el of els) {
    if (!el.name || el.disabled || (el as HTMLInputElement).type === 'submit' || (el as HTMLInputElement).type === 'file') continue;
    const inp = el as HTMLInputElement;
    if (inp.type === 'checkbox') {
      if (groups.has(inp.name)) { const arr = (out[inp.name] as string[]) ?? []; if (inp.checked) arr.push(inp.value); out[inp.name] = arr; }
      else out[inp.name] = inp.checked;
      continue;
    }
    if (inp.type === 'radio') { if (inp.checked) out[inp.name] = inp.value; continue; }
    const t = el.dataset.type || (inp.type === 'number' ? 'number' : '');
    const v = el.value.trim();
    out[el.name] = t === 'number' ? (v === '' ? null : Number(v)) : t === 'list' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v;
  }
  return out;
}
$$<HTMLFormElement>('form[data-api]').forEach((f) => f.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!f.checkValidity()) { f.reportValidity(); return; }
  const btn = f.querySelector<HTMLButtonElement>('[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(f.dataset.api!, { method: f.dataset.method || 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formJson(f)) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = withLang('/connexion') + '?retour=' + encodeURIComponent(location.pathname); return; }
    if (!res.ok || d.ok === false) { toast(d.error || (EN ? 'Something went wrong. Please try again.' : 'Une erreur est survenue. Réessayez.')); if (d.redirect) setTimeout(() => (location.href = d.redirect), 1500); return; }
    toast(d.message || f.dataset.success || (EN ? 'Saved.' : 'Enregistré.'));
    if (f.hasAttribute('data-reset')) f.reset();
    if (d.redirect || f.dataset.redirect) setTimeout(() => (location.href = d.redirect || f.dataset.redirect!), 700);
    else if (f.hasAttribute('data-reload')) setTimeout(() => location.reload(), 700);
  } catch {
    toast(EN ? 'Network error. Check your connection.' : 'Erreur réseau. Vérifiez votre connexion.');
  } finally {
    if (btn) btn.disabled = false;
  }
}));
/* Boutons d'action simples : <button data-post="/api/xxx" data-body='{"…"}' [data-reload]> */
$$<HTMLButtonElement>('[data-post]').forEach((b) => b.addEventListener('click', async () => {
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  b.disabled = true;
  const res = await fetch(b.dataset.post!, { method: b.dataset.method || 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: b.dataset.body || '{}' }).catch(() => null);
  const d = res ? await res.json().catch(() => ({})) : {};
  b.disabled = false;
  if (res?.status === 401) { location.href = withLang('/connexion') + '?retour=' + encodeURIComponent(location.pathname); return; }
  if (!res || !res.ok || d.ok === false) { toast(d.error || (EN ? 'Something went wrong.' : 'Une erreur est survenue.')); if (d.redirect) setTimeout(() => (location.href = d.redirect), 1500); return; }
  toast(d.message || (EN ? 'Done.' : 'C’est fait.'));
  if (d.redirect) setTimeout(() => (location.href = d.redirect), 600);
  else if (b.hasAttribute('data-reload')) setTimeout(() => location.reload(), 600);
}));

/* ===== Lecture audio des contenus clés (CDC §5.1) : <button data-listen="sélecteur"> lit le contenu avec la synthèse vocale du navigateur ===== */
$$<HTMLButtonElement>('[data-listen]').forEach((b) => {
  if (!('speechSynthesis' in window)) return;
  b.hidden = false;
  const label = $('[data-listen-label]', b);
  const idle = EN ? 'Listen' : 'Écouter', busy = EN ? 'Stop' : 'Arrêter';
  const stop = () => { speechSynthesis.cancel(); b.setAttribute('aria-pressed', 'false'); if (label) label.textContent = idle; };
  b.addEventListener('click', () => {
    if (b.getAttribute('aria-pressed') === 'true') return stop();
    const el = b.dataset.listen!.split(',').map((s) => $(s.trim())).find(Boolean);
    // Texte lisible : on écarte formulaires, boutons et zones techniques
    const clone = el?.cloneNode(true) as HTMLElement | undefined;
    clone?.querySelectorAll('form, button, textarea, input, select, script, style, [aria-hidden="true"], .tutor').forEach((x) => x.remove());
    const text = [b.closest('.page-head')?.querySelector('h1')?.textContent, clone?.innerText || clone?.textContent].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();
    if (!text) return;
    speechSynthesis.cancel();
    // Lecture par morceaux : certains navigateurs coupent les textes longs
    const parts = text.match(/[^.!?]{1,220}[.!?]?/g) ?? [text];
    const lang = document.querySelector('main')?.getAttribute('lang') === 'en' || EN ? 'en-GB' : 'fr-FR';
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = lang;
      if (i === parts.length - 1) u.onend = stop;
      speechSynthesis.speak(u);
    });
    b.setAttribute('aria-pressed', 'true');
    if (label) label.textContent = busy;
  });
  addEventListener('pagehide', stop);
});

/* ===== Outils du lecteur vidéo (CDC §7.6) : vitesse de lecture, mode audio seul, notes horodatées (enregistrées sur l'appareil) ===== */
$$<HTMLVideoElement>('video').forEach((v, n) => {
  if (v.dataset.tools === 'off' || !v.controls) return; // caméra du scanner, vidéos décoratives
  const key = 'cea-vnotes:' + (v.currentSrc || v.querySelector('source')?.getAttribute('src') || v.getAttribute('src') || location.pathname + '#' + n);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const bar = document.createElement('div');
  bar.className = 'vtools';
  bar.innerHTML = `
    <label class="xs">${EN ? 'Speed' : 'Vitesse'} <select class="in" data-speed aria-label="${EN ? 'Playback speed' : 'Vitesse de lecture'}">${[0.75, 1, 1.25, 1.5, 2].map((x) => `<option value="${x}"${x === 1 ? ' selected' : ''}>${String(x).replace('.', EN ? '.' : ',')}×</option>`).join('')}</select></label>
    <button class="btn btn-ghost btn-sm" type="button" data-audio aria-pressed="false">${EN ? 'Audio only' : 'Audio seul'}</button>
    <button class="btn btn-ghost btn-sm" type="button" data-addnote>${EN ? 'Add a note here' : 'Noter à ce moment'}</button>
    <ul class="vnotes" data-notes></ul>`;
  // Le lecteur est parfois positionné en absolu dans un cadre : la barre se place après ce cadre
  const host = v.closest('.player') ?? v;
  host.after(bar);
  const speed = $<HTMLSelectElement>('[data-speed]', bar)!;
  speed.addEventListener('change', () => { v.playbackRate = Number(speed.value); });
  const audio = $<HTMLButtonElement>('[data-audio]', bar)!;
  audio.addEventListener('click', () => {
    const on = audio.getAttribute('aria-pressed') !== 'true';
    audio.setAttribute('aria-pressed', String(on));
    host.classList.toggle('audio-only', on);
  });
  type Note = { t: number; text: string };
  const read = (): Note[] => { try { return JSON.parse(store(key) || '[]'); } catch { return []; } };
  const list = $('[data-notes]', bar)!;
  const render = () => {
    list.innerHTML = '';
    read().sort((a, b) => a.t - b.t).forEach((x, i, all) => {
      const li = document.createElement('li');
      const go = document.createElement('button'); go.type = 'button'; go.className = 'linkbtn'; go.textContent = fmt(x.t);
      go.addEventListener('click', () => { v.currentTime = x.t; v.play().catch(() => {}); });
      const del = document.createElement('button'); del.type = 'button'; del.className = 'linkbtn xs'; del.textContent = '✕'; del.setAttribute('aria-label', EN ? 'Delete note' : 'Supprimer la note');
      del.addEventListener('click', () => { store(key, JSON.stringify(all.filter((_, j) => j !== i))); render(); });
      li.append(go, document.createTextNode(' ' + x.text + ' '), del);
      list.append(li);
    });
  };
  $('[data-addnote]', bar)!.addEventListener('click', () => {
    const t = v.currentTime;
    v.pause();
    const text = prompt((EN ? 'Note at ' : 'Note à ') + fmt(t));
    if (!text?.trim()) return;
    store(key, JSON.stringify([...read(), { t, text: text.trim().slice(0, 500) }]));
    render();
  });
  render();
});
