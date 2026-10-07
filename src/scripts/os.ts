/* CEA OS — interactions communes du back-office (prototype CEA OS) :
   - <button data-dlg="id"> ouvre le dialogue #id ; [data-close] le ferme ; un dialogue s'ouvre aussi depuis ?ouvrir=id ;
   - sélecteur de périmètre (cookie os-scope) ;
   - <form data-upload="/api/…"> : envoi multipart (pièces jointes) puis rechargement ;
   - <select data-go> : navigation vers la valeur choisie ;
   - [data-filter="#tableau"] : filtre plein texte des lignes d'un tableau. */
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

$$<HTMLSelectElement>('select[data-go]').forEach((s) => s.addEventListener('change', () => { location.href = s.value; }));

$$<HTMLInputElement>('[data-filter]').forEach((i) => i.addEventListener('input', () => {
  const q = i.value.toLowerCase().trim();
  $$<HTMLElement>(i.dataset.filter + ' [data-row]').forEach((r) => { r.hidden = !!q && !(r.dataset.row ?? r.textContent ?? '').toLowerCase().includes(q); });
}));

export {};
