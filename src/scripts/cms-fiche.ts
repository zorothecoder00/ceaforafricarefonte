/* Fiche structurée du CMS (CDC §12) : formulaire généré pour les champs propres à chaque type (événement, cours, page).
   Les valeurs vivent dans l'objet `data` (colonne cms_content.data) ; chaque saisie le met à jour via un chemin (ex. « tickets.0.p »).
   La validation complète est faite par le serveur (src/lib/catalog.ts) au moment de valider ou publier. */

type Kind = 'text' | 'textarea' | 'number' | 'float' | 'date' | 'time' | 'select' | 'checkbox' | 'lines' | 'csv' | 'rank';
type Field = { k: string; label: string; kind: Kind; options?: string[]; hint?: string; wide?: boolean; nullable?: boolean };
type List = { k: string; label: string; item: Field[]; add: () => Record<string, unknown>; title?: (x: Record<string, unknown>, i: number) => string };
type Group = { k: string; label: string; fields: Field[]; empty: () => Record<string, unknown> }; // objet facultatif (null si décoché)
type Section = { title: string; fields?: Field[]; list?: List; group?: Group };

const COUNTRIES: [string, string][] = JSON.parse(document.getElementById('cmsCountries')?.textContent || '[]');

export const SPECS: Record<string, Section[]> = {
  event: [
    { title: 'Quand et où', fields: [
      { k: 'date', label: 'Date (1er jour)', kind: 'date' }, { k: 'time', label: 'Heure de début', kind: 'time' },
      { k: 'city', label: 'Ville (ou « En ligne »)', kind: 'text' }, { k: 'country', label: 'Pays', kind: 'select', options: COUNTRIES.map(([c]) => c) },
      { k: 'format', label: 'Format', kind: 'select', options: ['Présentiel', 'En ligne', 'Hybride'] },
      { k: 'capacity', label: 'Jauge (places)', kind: 'number', nullable: true, hint: 'Vide = sans limite' },
      { k: 'big', label: 'Grand événement (mis en avant)', kind: 'checkbox' },
      { k: 'audience', label: 'Pour qui ? (une ligne par public)', kind: 'lines', wide: true },
    ] },
    { title: 'Lieu', group: { k: 'venue', label: 'Événement dans un lieu physique', empty: () => ({ name: '', address: '', lat: 0, lon: 0 }), fields: [
      { k: 'name', label: 'Nom du lieu', kind: 'text' }, { k: 'address', label: 'Adresse', kind: 'text' },
      { k: 'lat', label: 'Latitude', kind: 'float', hint: 'Ex. 6.1307 (carte OpenStreetMap)' }, { k: 'lon', label: 'Longitude', kind: 'float' },
    ] } },
    { title: 'Billets', list: { k: 'tickets', label: 'catégorie', add: () => ({ n: 'Entrée', p: 0 }), title: (x) => String(x.n || 'Billet'), item: [
      { k: 'n', label: 'Catégorie', kind: 'text' }, { k: 'p', label: 'Prix (FCFA, 0 = gratuit)', kind: 'number' },
    ] } },
    { title: 'Programme', list: { k: 'sessions', label: 'session', add: () => ({ day: 1, time: '09:00', title: '', room: '', theme: '', speakers: [] }), title: (x) => `Jour ${x.day} · ${x.time} — ${x.title || 'Session'}`, item: [
      { k: 'day', label: 'Jour', kind: 'number' }, { k: 'time', label: 'Heure', kind: 'time' }, { k: 'title', label: 'Titre', kind: 'text', wide: true },
      { k: 'room', label: 'Salle', kind: 'text' }, { k: 'theme', label: 'Thème', kind: 'text' },
      { k: 'speakers', label: 'Intervenants (séparés par des virgules)', kind: 'csv', wide: true, hint: 'Une session dont le titre contient « B2B » ouvre les rendez-vous d’affaires.' },
    ] } },
    { title: 'Intervenants', list: { k: 'speakers', label: 'intervenant', add: () => ({ n: '', r: '', c: '' }), title: (x) => String(x.n || 'Intervenant'), item: [
      { k: 'n', label: 'Nom', kind: 'text' }, { k: 'r', label: 'Fonction', kind: 'text' }, { k: 'c', label: 'Pays', kind: 'select', options: ['', ...COUNTRIES.map(([c]) => c)] },
    ] } },
    { title: 'Sponsors et partenaires', list: { k: 'sponsors', label: 'sponsor', add: () => ({ tier: 'Partenaire', n: '' }), title: (x) => `${x.tier} — ${x.n || 'Sponsor'}`, item: [
      { k: 'tier', label: 'Niveau', kind: 'text' }, { k: 'n', label: 'Nom', kind: 'text' },
    ] } },
    { title: 'Informations pratiques', group: { k: 'practical', label: 'Afficher hébergement et visa', empty: () => ({ hotels: [], visa: '' }), fields: [
      { k: 'hotels', label: 'Hôtels (une ligne chacun)', kind: 'lines', wide: true }, { k: 'visa', label: 'Visa', kind: 'textarea', wide: true },
    ] } },
  ],
  course: [
    { title: 'Fiche du cours', fields: [
      { k: 'theme', label: 'Thème', kind: 'text' }, { k: 'level', label: 'Niveau', kind: 'select', options: ['Débutant', 'Intermédiaire', 'Avancé'] },
      { k: 'duration', label: 'Durée (ex. 2 h 10)', kind: 'text' }, { k: 'price', label: 'Prix (FCFA, 0 = gratuit)', kind: 'number' },
      { k: 'by', label: 'Formateur ou formatrice', kind: 'text' }, { k: 'langs', label: 'Langues (séparées par des virgules)', kind: 'csv' },
      { k: 'trainer.role', label: 'Fonction du formateur', kind: 'text', wide: true }, { k: 'trainer.bio', label: 'Biographie', kind: 'textarea', wide: true },
      { k: 'trailer', label: 'Vidéo de présentation (facultatif)', kind: 'text', wide: true, hint: 'Lien YouTube, Vimeo ou fichier .mp4 en https://' },
    ] },
    { title: 'Leçons', list: { k: 'lessons', label: 'leçon', add: () => ({ title: '', video: '', s: '', k: [] }), title: (x, i) => `Leçon ${i + 1} — ${x.title || 'sans titre'}`, item: [
      { k: 'title', label: 'Titre', kind: 'text', wide: true },
      { k: 'video', label: 'Vidéo de la leçon (facultatif)', kind: 'text', wide: true, hint: 'Lien YouTube, Vimeo ou fichier .mp4 en https://' },
      { k: 's', label: 'Contenu', kind: 'textarea', wide: true },
      { k: 'k', label: 'À retenir (une ligne par point)', kind: 'lines', wide: true },
    ] } },
    { title: 'Quiz final (corrigé par le serveur, réponses jamais envoyées au navigateur)', list: { k: 'quiz', label: 'question', add: () => ({ q: '', o: ['', ''], a: 0 }), title: (_x, i) => `Question ${i + 1}`, item: [
      { k: 'q', label: 'Question', kind: 'text', wide: true }, { k: 'o', label: 'Réponses proposées (une par ligne)', kind: 'lines', wide: true },
      { k: 'a', label: 'N° de la bonne réponse', kind: 'rank' },
    ] } },
  ],
  page: [{ title: 'Mise en page', fields: [{ k: 'layout', label: 'Gabarit', kind: 'select', options: ['site', 'kapital'], hint: '« kapital » : en-tête et pied de page de CEA Kapital Invest' }] }],
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((x, k) => (x == null ? undefined : (x as Record<string, unknown>)[k]), o);
function set(o: Record<string, unknown>, path: string, v: unknown) {
  const ks = path.split('.');
  let cur: Record<string, unknown> = o;
  ks.slice(0, -1).forEach((k) => { cur[k] ??= {}; cur = cur[k] as Record<string, unknown>; });
  cur[ks.at(-1)!] = v;
}

function input(f: Field, path: string, v: unknown, ro: string) {
  const id = `fd-${path.replace(/\./g, '-')}`;
  const lab = `<label class="f" for="${id}">${esc(f.label)}${f.hint ? ` <span class="xs muted">— ${esc(f.hint)}</span>` : ''}</label>`;
  const a = `id="${id}" data-p="${path}" data-kind="${f.kind}"${f.nullable ? ' data-null="1"' : ''}${ro}`;
  const wrap = (h: string) => `<div${f.wide ? ' style="grid-column:1/-1"' : ''}>${h}</div>`;
  switch (f.kind) {
    case 'checkbox': return wrap(`<label class="row small" style="margin-top:22px"><input type="checkbox" ${a}${v ? ' checked' : ''} /> ${esc(f.label)}</label>`);
    case 'select': return wrap(lab + `<select class="in" ${a}>${(f.options ?? []).map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(f.k === 'country' || f.k === 'c' ? (COUNTRIES.find(([c]) => c === o)?.[1] ?? (o || '—')) : o)}</option>`).join('')}</select>`);
    case 'textarea': return wrap(lab + `<textarea class="in" rows="4" ${a}>${esc(String(v ?? ''))}</textarea>`);
    case 'lines': return wrap(lab + `<textarea class="in" rows="3" ${a}>${esc(((v as string[]) ?? []).join('\n'))}</textarea>`);
    case 'csv': return wrap(lab + `<input class="in" ${a} value="${esc(((v as string[]) ?? []).join(', '))}" />`);
    case 'rank': return wrap(lab + `<input class="in" type="number" min="1" max="6" ${a} value="${Number(v ?? 0) + 1}" />`);
    case 'number': case 'float': return wrap(lab + `<input class="in" type="number"${f.kind === 'float' ? ' step="any"' : ' min="0"'} ${a} value="${v ?? ''}" />`);
    default: return wrap(lab + `<input class="in" type="${f.kind === 'date' ? 'date' : f.kind === 'time' ? 'time' : 'text'}" ${a} value="${esc(String(v ?? ''))}" />`);
  }
}
const grid = (h: string) => `<div class="grid g2" style="gap:0 12px">${h}</div>`;

function convert(el: HTMLInputElement): unknown {
  const k = el.dataset.kind;
  if (k === 'checkbox') return el.checked;
  if (k === 'lines') return el.value.split('\n').map((x) => x.trim()).filter(Boolean);
  if (k === 'csv') return el.value.split(',').map((x) => x.trim()).filter(Boolean);
  if (k === 'rank') return Math.max(0, Number(el.value || 1) - 1);
  if (k === 'number' || k === 'float') return el.value === '' && el.dataset.null ? null : Number(el.value || 0);
  return el.value;
}

/** Monte la fiche dans `root` ; `onChange` est appelé à chaque modification de `data`. */
export function mountFiche(root: HTMLElement, type: string, data: Record<string, unknown>, locked: boolean, onChange: () => void) {
  const specs = SPECS[type];
  if (!specs) return;
  const ro = locked ? ' disabled' : '';
  const render = () => {
    root.innerHTML = specs.map((s) => {
      let body = '';
      if (s.fields) body = grid(s.fields.map((f) => input(f, f.k, get(data, f.k), ro)).join(''));
      if (s.group) {
        const g = s.group, v = data[g.k] as Record<string, unknown> | null;
        body = `<label class="row small"><input type="checkbox" data-group="${g.k}"${v ? ' checked' : ''}${ro} /> ${esc(g.label)}</label>` + (v ? grid(g.fields.map((f) => input(f, `${g.k}.${f.k}`, v[f.k], ro)).join('')) : '');
      }
      if (s.list) {
        const l = s.list, items = (data[l.k] as Record<string, unknown>[]) ?? [];
        body = items.map((x, i) => `<details class="cms-block"${items.length <= 3 ? ' open' : ''}><summary class="row between"><b class="xs">${esc(l.title ? l.title(x, i) : `${l.label} ${i + 1}`)}</b>${locked ? '' : `<span class="row" style="gap:4px"><button class="btn btn-ghost btn-sm" type="button" data-lmv="-1" data-l="${l.k}" data-i="${i}"${i === 0 ? ' disabled' : ''} aria-label="Monter">↑</button><button class="btn btn-ghost btn-sm" type="button" data-lmv="1" data-l="${l.k}" data-i="${i}"${i === items.length - 1 ? ' disabled' : ''} aria-label="Descendre">↓</button><button class="btn btn-ghost btn-sm" type="button" data-ldel="${i}" data-l="${l.k}" aria-label="Supprimer">✕</button></span>`}</summary>${grid(l.item.map((f) => input(f, `${l.k}.${i}.${f.k}`, x[f.k], ro)).join(''))}</details>`).join('')
          + (locked ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-ladd="${l.k}">+ Ajouter une ${esc(l.label)}</button>`);
      }
      return `<details open style="margin-top:14px"><summary><b>${esc(s.title)}</b></summary><div style="margin-top:8px">${body}</div></details>`;
    }).join('');
  };
  render();
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.p) return;
    set(data, el.dataset.p, convert(el));
    onChange();
  });
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    const g = el.dataset.group;
    if (g) { const spec = specs.find((s) => s.group?.k === g)!.group!; data[g] = el.checked ? spec.empty() : null; onChange(); render(); }
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    const l = b.dataset.l ?? b.dataset.ladd;
    if (!l) return;
    const items = ((data[l] as unknown[]) ??= []);
    if (b.dataset.ladd) items.push(specs.find((s) => s.list?.k === l)!.list!.add());
    else if (b.dataset.ldel) { if (!confirm('Supprimer cet élément ?')) return; items.splice(Number(b.dataset.ldel), 1); }
    else if (b.dataset.lmv) { const i = Number(b.dataset.i), j = i + Number(b.dataset.lmv); [items[i], items[j]] = [items[j], items[i]]; }
    e.preventDefault();
    onChange(); render();
  });
}
