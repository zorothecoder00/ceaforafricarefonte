/* Recherche tolérante aux fautes (CDC §10 « recherche universelle ») : sans accents ni casse, préfixes, distance d'édition. */

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Distance de Damerau-Levenshtein restreinte (inversion de deux lettres voisines = 1 faute), arrêt anticipé au-delà de max. */
export function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Fautes tolérées selon la longueur du mot cherché. */
const tolerance = (w: string) => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0);

/** Score d'un mot cherché dans un texte : 3 = présent tel quel, 2 = début de mot, 1 = à une ou deux fautes près, 0 = absent. */
function wordScore(w: string, text: string, toks: string[]) {
  if (text.includes(w)) return 3;
  if (toks.some((t) => t.startsWith(w))) return 2;
  const tol = tolerance(w);
  if (!tol) return 0;
  // Compare aussi au début des mots plus longs (« financ » ≈ « finnac… »)
  return toks.some((t) => distance(w, t, tol) <= tol || (t.length > w.length && distance(w, t.slice(0, w.length), tol) <= tol)) ? 1 : 0;
}

/** Note un élément (titre pondéré double) ; 0 si un des mots cherchés est introuvable. */
export function score(query: string, title: string, desc = ''): number {
  const words = tokens(query);
  if (!words.length) return 0;
  const t = norm(title), d = norm(desc), tt = tokens(title), dt = tokens(desc);
  let total = 0;
  for (const w of words) {
    const s = Math.max(wordScore(w, t, tt) * 2, wordScore(w, d, dt));
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** Filtre et classe une liste par pertinence. */
export function search<T>(items: T[], query: string, get: (x: T) => [string, string], limit = 20): T[] {
  return items.map((x) => ({ x, s: score(query, ...get(x)) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.x);
}
