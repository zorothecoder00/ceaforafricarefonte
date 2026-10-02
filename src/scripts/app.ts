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
  toast(`Taille du texte : ${next}px`);
});
const liteBtn = $('#liteBtn');
liteBtn?.setAttribute('aria-pressed', String(root.classList.contains('lite')));
liteBtn?.addEventListener('click', () => {
  const on = root.classList.toggle('lite');
  store('cea-lite', on ? '1' : null);
  liteBtn.setAttribute('aria-pressed', String(on));
  toast(on ? 'Mode Lite activé : animations, cartes et vidéos masquées.' : 'Mode Lite désactivé.');
});

/* ===== menu ===== */
const menuBtn = $('#menuBtn'), panel = $('#menuPanel');
menuBtn?.addEventListener('click', () => {
  const open = panel!.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel?.classList.contains('open')) { panel.classList.remove('open'); menuBtn?.setAttribute('aria-expanded', 'false'); }
});

/* ===== langue ===== */
const langSel = $<HTMLSelectElement>('#langSel');
langSel?.addEventListener('change', () => {
  const msg: Record<string, string> = { en: 'English version: coming in phase 2.', pt: 'Português : prévu en V2.', ar: 'العربية : prévu en V2 (affichage de droite à gauche).', sw: 'Kiswahili : prévu en V3.' };
  if (langSel.value !== 'fr') { toast(msg[langSel.value]); langSel.value = 'fr'; }
});

/* ===== devise ===== */
const RATES: Record<string, number> = { XOF: 1, EUR: 1 / 655.957, USD: 1 / 605 };
function renderMoney(cur: string) {
  $$('.money').forEach((el) => {
    const xof = Number(el.dataset.xof);
    if (!xof) { el.textContent = el.dataset.free || 'Gratuit'; return; }
    const v = xof * RATES[cur];
    el.textContent = cur === 'XOF' ? Math.round(v).toLocaleString('fr-FR') + ' FCFA' : v.toLocaleString('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 0 });
  });
}
const curSel = $<HTMLSelectElement>('#curSel');
const savedCur = store('cea-cur');
if (curSel && savedCur && RATES[savedCur]) { curSel.value = savedCur; renderMoney(savedCur); }
curSel?.addEventListener('change', () => { store('cea-cur', curSel.value); renderMoney(curSel.value); });

/* ===== carte de l'Afrique ===== */
$$('[data-map]').forEach((map) => {
  const hubs = JSON.parse(map.dataset.hubs || '[]');
  const card = $('.map-card', map);
  $$('.hub', map).forEach((g) => {
    const show = () => {
      $$('.hub', map).forEach((x) => x.classList.remove('on'));
      g.classList.add('on');
      const h = hubs[Number(g.dataset.i)];
      if (card && h) card.innerHTML = `<h4>${h.name}${h.hq ? ' <span class="tag gold">Siège</span>' : ''}</h4><div class="kv"><span>Membres</span><b>${h.m}</b><span>Projets accompagnés</span><b>${h.p}</b><span>Événements en 2026</span><b>${h.e}</b></div><span class="small" style="color:#546273">Antenne de ${h.city} · ${h.lead}</span>`;
    };
    g.addEventListener('mouseenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('click', show);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
  });
});

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
  opts.forEach((b, i) => b.addEventListener('click', () => { store('cea-vote-' + id, String(i)); show(i); toast('Merci, votre vote est enregistré.'); }));
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

/* ===== recherche (Ctrl+K) ===== */
type Entry = { t: string; d: string; h: string; ty: string };
const index: Entry[] = JSON.parse($('#searchIndex')?.textContent || '[]');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dlg = $<HTMLDialogElement>('#dlg');
const sq = $<HTMLInputElement>('#sq'), sres = $('#sres');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function runSearch() {
  const q = norm(sq!.value.trim());
  if (!q) { sres!.innerHTML = '<p class="small muted">Tapez au moins une lettre. Astuce : Ctrl+K ouvre la recherche partout.</p>'; return; }
  const seen = new Set<string>();
  const res = index.filter((x) => norm(x.t + ' ' + x.d).includes(q) && !seen.has(x.ty + x.t) && seen.add(x.ty + x.t)).slice(0, 12);
  sres!.innerHTML = res.length
    ? res.map((x) => `<a href="${x.h}"><span class="tag info">${esc(x.ty)}</span><span><b>${esc(x.t)}</b><br><span class="small muted">${esc(x.d)}</span></span></a>`).join('')
    : '<div class="empty">Aucun résultat. Essayez un autre mot ou demandez à CEA Copilot.</div>';
}
function openSearch() { dlg?.showModal(); sq!.value = ''; runSearch(); sq!.focus(); }
sq?.addEventListener('input', runSearch);
$('#searchBtn')?.addEventListener('click', openSearch);
$('#dlgClose')?.addEventListener('click', () => dlg?.close());
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } });

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

const RULES: [RegExp, string][] = [
  [/lev|fonds|financ|investor ready/, 'Pour préparer une levée : commencez par le diagnostic gratuit « Suis-je prêt ? » (8 questions) → /kapital/diagnostic. Ensuite, le programme Investor Ready vous accompagne pendant 10 semaines.'],
  [/invest|opportunit/, 'Les opportunités vérifiées par nos analystes sont sur /kapital/opportunites. Pour accéder aux dossiers complets, créez votre profil investisseur : /kapital/devenir-investisseur. Rappel : investir comporte un risque de perte en capital.'],
  [/cours|formation|gratuit|acad/, "CEA Academy propose 8 cours, dont 4 gratuits : « Créer son entreprise dans l'espace OHADA », « Pitcher devant des investisseurs », « Marketing digital à petit budget »… → /academie"],
  [/event|forum|agenda/, 'Prochain grand rendez-vous : le Forum panafricain CEA 2026, du 26 au 28 novembre à Lomé, avec un Demo Day devant 40 investisseurs → /evenements/e1'],
  [/emploi|job|stage|recrut/, "10 offres d'emploi et de stage vérifiées sont en ligne → /opportunites"],
  [/bourse|brvm|march/, 'Suivez la BRVM, la JSE, la NGX, la NSE et les autres places africaines sur /kapital/marches (valeurs fictives dans ce prototype).'],
  [/programme|accél|incub|candidat/, "L'Accélérateur — Cohorte 4 est ouvert jusqu'au 15 novembre 2026 : six mois d'accompagnement et un Demo Day → /programmes"],
  [/contact|aide|support/, "Écrivez-nous depuis /contact : votre message est transmis directement à la bonne équipe dans votre pays."],
];
function say(text: string, who: 'u' | 'a') {
  const m = document.createElement('div');
  m.className = 'msg ' + who;
  if (who === 'a') m.innerHTML = esc(text).replace(/(\/[a-z0-9/-]+)/g, '<a href="$1">$1</a>');
  else m.textContent = text;
  body?.appendChild(m);
  body!.scrollTop = body!.scrollHeight;
}
function answer(q: string) {
  say(q, 'u');
  const n = norm(q);
  const hit = RULES.find(([r]) => r.test(n));
  setTimeout(() => say(hit ? hit[1] : "Je n'ai pas encore la réponse à cette question. Essayez la recherche (Ctrl+K) ou écrivez à l'équipe via /contact.", 'a'), 350);
}
$('#chatForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input!.value.trim();
  if (!v) return;
  input!.value = '';
  answer(v);
});
$$('#sugg button').forEach((b) => b.addEventListener('click', () => answer(b.textContent || '')));
