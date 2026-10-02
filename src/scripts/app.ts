/* Interactions globales du site (thème, menu, devise, carte, votes, Copilot, recherche…). */

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
      if (card && h) card.innerHTML = `<h4>${h.name}${h.hq ? ` <span class="tag gold">${EN ? 'HQ' : 'Siège'}</span>` : ''}</h4><div class="kv"><span>${EN ? 'Members' : 'Membres'}</span><b>${h.m}</b><span>${EN ? 'Projects supported' : 'Projets accompagnés'}</span><b>${h.p}</b><span>${EN ? 'Events in 2026' : 'Événements en 2026'}</span><b>${h.e}</b></div><a class="small" style="color:#082B4C;font-weight:700" href="${withLang('/pays/' + h.code)}">${EN ? 'Office:' : 'Antenne de'} ${h.city} · ${h.lead}</a>`;
    };
    const go = () => { location.href = withLang('/pays/' + h.code); };
    g.addEventListener('mouseenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
});

/* ===== compteurs animés (respectent « moins d'animations » et le mode Lite) ===== */
const counters = $$('[data-count]');
if (counters.length) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('lite');
  const run = (el: HTMLElement) => {
    const end = Number(el.dataset.count), suffix = el.dataset.suffix || '';
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

/* ===== consultations (votes) ===== */
$$('[data-vote]').forEach((box) => {
  const id = box.dataset.vote!;
  const opts = $$<HTMLButtonElement>('.vote-opt', box);
  const show = (chosen: number) => {
    const counts = opts.map((b, i) => Number(b.dataset.n) + (i === chosen ? 1 : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    opts.forEach((b, i) => {
      const pct = Math.round((counts[i] / total) * 100);
      ($('.bar', b) as HTMLElement).style.width = pct + '%';
      $('.pct', b)!.textContent = pct + ' %' + (i === chosen ? ' ✓' : '');
      b.disabled = true;
    });
    $('.vote-total', box)!.textContent = total.toLocaleString('fr-FR');
  };
  const prev = store('cea-vote-' + id);
  if (prev !== null) show(Number(prev));
  opts.forEach((b, i) => b.addEventListener('click', () => { store('cea-vote-' + id, String(i)); show(i); toast(EN ? 'Thank you, your vote has been recorded.' : 'Merci, votre vote est enregistré.'); }));
});

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
type Entry = { t: string; d: string; h: string; ty: string };
const index: Entry[] = JSON.parse($('#searchIndex')?.textContent || '[]');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dlg = $<HTMLDialogElement>('#dlg');
const sq = $<HTMLInputElement>('#sq'), sres = $('#sres');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function runSearch() {
  const q = norm(sq!.value.trim());
  if (!q) { sres!.innerHTML = `<p class="small muted">${EN ? 'Type at least one letter. Tip: Ctrl+K or / opens search anywhere.' : 'Tapez au moins une lettre. Astuce : Ctrl+K ou / ouvre la recherche partout.'}</p>`; return; }
  const words = q.split(/\s+/);
  const seen = new Set<string>();
  const res = index.filter((x) => { const s = norm(x.t + ' ' + x.d); return words.every((w) => s.includes(w)) && !seen.has(x.ty + x.t) && seen.add(x.ty + x.t); }).slice(0, 12);
  sres!.innerHTML = res.length
    ? res.map((x) => `<a href="${x.h}"><span class="tag info">${esc(x.ty)}</span><span><b>${esc(x.t)}</b><br><span class="small muted">${esc(x.d)}</span></span></a>`).join('')
    : `<div class="empty">${EN ? 'No results. Try another word or ask CEA Copilot.' : 'Aucun résultat. Essayez un autre mot ou demandez à CEA Copilot.'}</div>`;
}
function openSearch() { closeMegas(); dlg?.showModal(); sq!.value = ''; runSearch(); sq!.focus(); }
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
  [/bourse|brvm|march|exchange|stock/, 'Suivez la BRVM, la JSE, la NGX, la NSE et les autres places africaines sur /kapital/marches (valeurs fictives dans ce prototype).', 'Follow the BRVM, JSE, NGX, NSE and other African exchanges at /kapital/marches (fictitious values in this prototype).'],
  [/programme|program|accel|incub|candidat|apply/, "L'Accélérateur — Cohorte 4 est ouvert jusqu'au 15 novembre 2026 : six mois d'accompagnement et un Demo Day → /programmes", 'The Accelerator — Cohort 4 is open until 15 November 2026: six months of support and a Demo Day → /programmes'],
  [/contact|aide|support|help/, 'Écrivez-nous depuis /contact : votre message est transmis directement à la bonne équipe dans votre pays.', 'Write to us at /contact: your message goes straight to the right team in your country.'],
  [/commencer|start|perdu|lost/, 'Pas sûr de savoir par où commencer ? Choisissez votre profil sur /commencer.', 'Not sure where to start? Choose your profile at /commencer.'],
];
function say(text: string, who: 'u' | 'a') {
  const m = document.createElement('div');
  m.className = 'msg ' + who;
  if (who === 'a') m.innerHTML = esc(text).replace(/(\/[a-z0-9/-]+)/g, (p) => `<a href="${withLang(p)}">${withLang(p)}</a>`);
  else m.textContent = text;
  body?.appendChild(m);
  body!.scrollTop = body!.scrollHeight;
}
function answer(q: string) {
  say(q, 'u');
  const n = norm(q);
  const hit = RULES.find(([r]) => r.test(n));
  const fallback = EN ? "I don't have an answer to that yet. Try search (Ctrl+K) or write to the team via /contact." : "Je n'ai pas encore la réponse à cette question. Essayez la recherche (Ctrl+K) ou écrivez à l'équipe via /contact.";
  setTimeout(() => say(hit ? hit[EN ? 2 : 1] : fallback, 'a'), 350);
}
$('#chatForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input!.value.trim();
  if (!v) return;
  input!.value = '';
  answer(v);
});
$$('#sugg button').forEach((b) => b.addEventListener('click', () => answer(b.textContent || '')));

/* ===== application installable (PWA) : service worker en production uniquement ===== */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
