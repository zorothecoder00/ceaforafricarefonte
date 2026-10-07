/* CEA OS — interactions communes du back-office (prototype CEA OS) :
   - <button data-dlg="id"> ouvre le dialogue #id ; [data-close] le ferme ; un dialogue s'ouvre aussi depuis ?ouvrir=id ;
   - sélecteur de périmètre (cookie os-scope) ;
   - <form data-upload="/api/…"> : envoi multipart (pièces jointes) puis rechargement ;
   - <select data-go> : navigation vers la valeur choisie ;
   - [data-filter="#tableau"] : filtre plein texte des lignes d'un tableau ;
   - CEA Copilot interne (tiroir #cop) et rédactions guidées [data-ai-task]. */
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const toast = (t: string) => (window as unknown as { toast?: (t: string) => void }).toast?.(t);

$$<HTMLElement>('[data-dlg]').forEach((b) => b.addEventListener('click', () => {
  const d = document.getElementById(b.dataset.dlg!) as HTMLDialogElement | null;
  if (!d) return;
  // Pré-remplissage : data-set-<nom>="valeur" renseigne le champ name=<nom> du dialogue
  for (const [k, v] of Object.entries(b.dataset)) {
    if (!k.startsWith('set') || k === 'set') continue;
    const name = k.slice(3).replace(/^./, (c) => c.toLowerCase());
    const el = d.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el) el.value = v ?? '';
    const txt = d.querySelector<HTMLElement>(`[data-text="${name}"]`);
    if (txt) txt.textContent = v ?? '';
  }
  d.showModal();
  d.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea')?.focus();
}));
document.addEventListener('click', (e) => {
  const c = (e.target as Element).closest('[data-close]');
  if (c) c.closest('dialog')?.close();
});
const toOpen = new URLSearchParams(location.search).get('ouvrir');
if (toOpen) (document.getElementById(toOpen) as HTMLDialogElement | null)?.showModal?.();

/* Périmètre affiché */
document.getElementById('scopeSel')?.addEventListener('change', (e) => {
  document.cookie = `os-scope=${encodeURIComponent((e.target as HTMLSelectElement).value)}; path=/; max-age=31536000; samesite=lax`;
  location.reload();
});

/* Formulaires avec pièce jointe */
$$<HTMLFormElement>('form[data-upload]').forEach((f) => f.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!f.checkValidity()) { f.reportValidity(); return; }
  const btn = f.querySelector<HTMLButtonElement>('[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(f.dataset.upload!, { method: 'POST', credentials: 'same-origin', body: new FormData(f) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.ok === false) { toast(d.error || 'Une erreur est survenue. Réessayez.'); return; }
    toast(d.message || 'Enregistré.');
    f.closest('dialog')?.close();
    setTimeout(() => (d.redirect ? (location.href = d.redirect) : location.reload()), 700);
  } catch {
    toast('Erreur réseau. Vérifiez votre connexion.');
  } finally {
    if (btn) btn.disabled = false;
  }
}));

/* Recherche globale de CEA OS (bouton ⌕ et Ctrl+K) : remplace la recherche du site public dans le back-office */
const sdlg = document.getElementById('osSearch') as HTMLDialogElement | null;
const sq = document.getElementById('osSq') as HTMLInputElement | null, sr = document.getElementById('osSr');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const openSearch = () => { if (!sdlg || !sq) return; sdlg.showModal(); sq.value = ''; sq.focus(); };
document.getElementById('osSearchBtn')?.addEventListener('click', openSearch);
window.addEventListener('keydown', (e) => { if (sdlg && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); openSearch(); } }, true);
let st: number | undefined;
sq?.addEventListener('input', () => {
  clearTimeout(st);
  st = window.setTimeout(async () => {
    const q = sq.value.trim();
    if (!sr) return;
    if (q.length < 2) { sr.innerHTML = ''; return; }
    const r = await fetch('/api/admin/os/recherche?q=' + encodeURIComponent(q), { credentials: 'same-origin' }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    const res: [string, string, string][] = d?.results ?? [];
    sr.innerHTML = res.length ? res.map(([k, t, h]) => `<a href="${esc(h)}"><span class="tag info">${esc(k)}</span><span>${esc(t)}</span></a>`).join('') : '<div class="empty">Aucun résultat dans votre périmètre.</div>';
  }, 250);
});

/* CEA Copilot interne : tiroir de conversation (bouton ✦ Copilot) et rédactions guidées ([data-ai-task]) */
const cop = document.getElementById('cop'), copBody = document.getElementById('copBody'), copSugg = document.getElementById('copSugg');
const copIn = document.getElementById('copIn') as HTMLInputElement | null;
const hist: { role: 'user' | 'assistant'; content: string }[] = [];
const addMsg = (r: 'u' | 'a', t: string) => {
  const d = document.createElement('div');
  d.className = 'msg ' + r; d.textContent = t;
  copBody?.appendChild(d);
  if (copBody) copBody.scrollTop = 1e9;
  return d;
};
async function askCop(q: string) {
  if (!q.trim() || !copSugg) return;
  copSugg.innerHTML = '';
  addMsg('u', q);
  hist.push({ role: 'user', content: q });
  const a = addMsg('a', '…');
  const r = await fetch('/api/admin/os/copilot', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: hist.slice(-11) }) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  const t = r?.ok && d.reply ? d.reply : d.error || 'Copilot n’a pas pu répondre.';
  a.textContent = t;
  if (r?.ok) { hist.push({ role: 'assistant', content: t }); if (d.ai === false) document.getElementById('copMode')!.textContent = 'Mode hors ligne'; }
  else hist.pop();
}
function openCop() {
  if (!cop || !copBody || !copSugg) return;
  cop.classList.add('open');
  if (!copBody.children.length) {
    addMsg('a', `Bonjour ${cop.dataset.first ?? ''}. Je réponds à partir des données que vous êtes autorisé·e à voir.`);
    copSugg.innerHTML = '';
    for (const s of ['Combien me reste-t-il de congés ?', 'Quelles sont mes tâches ?', 'Comment faire une note de frais ?', 'Résume ma semaine']) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = s;
      b.addEventListener('click', () => askCop(s));
      copSugg.appendChild(b);
    }
  }
  copIn?.focus();
}
document.getElementById('copB')?.addEventListener('click', () => (cop?.classList.contains('open') ? cop.classList.remove('open') : openCop()));
document.getElementById('copX')?.addEventListener('click', () => cop?.classList.remove('open'));
document.getElementById('copF')?.addEventListener('submit', (e) => { e.preventDefault(); if (!copIn) return; const q = copIn.value; copIn.value = ''; askCop(q); });
(window as unknown as { openChat: () => void }).openChat = openCop;

const aiDlg = document.getElementById('osAi') as HTMLDialogElement | null, aiOut = document.getElementById('osAiOut') as HTMLTextAreaElement | null;
$$<HTMLButtonElement>('[data-ai-task]').forEach((b) => b.addEventListener('click', async () => {
  if (!aiDlg || !aiOut) return;
  document.getElementById('osAiT')!.textContent = b.dataset.aiTitle || 'CEA Copilot';
  aiOut.value = 'Rédaction en cours…';
  aiDlg.showModal();
  b.disabled = true;
  const r = await fetch('/api/admin/os/copilot', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: b.dataset.aiTask, id: b.dataset.aiId }) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  aiOut.value = r?.ok ? d.reply : d.error || 'Copilot n’a pas pu répondre.';
  b.disabled = false;
}));
document.getElementById('osAiCopy')?.addEventListener('click', () => { if (aiOut) navigator.clipboard?.writeText(aiOut.value).then(() => toast('Texte copié.'), () => toast('Copie impossible.')); });

$$<HTMLSelectElement>('select[data-go]').forEach((s) => s.addEventListener('change', () => { location.href = s.value; }));

$$<HTMLInputElement>('[data-filter]').forEach((i) => i.addEventListener('input', () => {
  const q = i.value.toLowerCase().trim();
  $$<HTMLElement>(i.dataset.filter + ' [data-row]').forEach((r) => { r.hidden = !!q && !(r.dataset.row ?? r.textContent ?? '').toLowerCase().includes(q); });
}));

export {};
