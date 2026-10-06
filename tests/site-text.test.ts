import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/lib/db', () => ({ db: {} }));
import { applySiteText, keyOf, pageScope, safeAttr } from '../src/lib/site-text';

const page = (body: string) => `<!doctype html><html><head><title>Accueil</title></head><body>${body}</body></html>`;
const m = (pairs: [string, string, string][]) => new Map(pairs.map(([k, o, v]) => [keyOf(k, o), v]));

describe('textes modifiables du site', () => {
  it('remplace un texte en conservant les espaces et le balisage voisin', () => {
    const { html, originals } = applySiteText(page('<h1>\n  Bonjour   le monde\n</h1><p>Autre</p>'), { page: m([['text', 'Bonjour le monde', 'Salut & <bienvenue>']]) });
    expect(html).toContain('<h1>\n  Salut &amp; &lt;bienvenue&gt;\n</h1><p>Autre</p>');
    expect(Object.values(originals)).toEqual(['Bonjour le monde']);
  });

  it('décode les entités pour calculer la clé', () => {
    const { html } = applySiteText(page("<p>L&#39;équipe &amp; nous</p>"), { page: m([['text', "L'équipe & nous", 'Nous']]) });
    expect(html).toContain('<p>Nous</p>');
  });

  it("ne touche ni l'en-tête du document, ni les scripts, ni les styles", () => {
    const src = page('<script>const a = "<p>Accueil</p>";</script><style>p{}</style><p>Accueil</p>');
    const { html } = applySiteText(src, { site: m([['text', 'Accueil', 'Home']]) });
    expect(html).toContain('<title>Accueil</title>');
    expect(html).toContain('const a = "<p>Accueil</p>";');
    expect(html).toContain('<p>Home</p>');
  });

  it('la portée page prime sur la portée site', () => {
    const { html } = applySiteText(page('<p>Texte</p>'), { page: m([['text', 'Texte', 'Page']]), site: m([['text', 'Texte', 'Site']]) });
    expect(html).toContain('<p>Page</p>');
  });

  it('en back-office, la portée site ne s\'applique qu\'hors du contenu principal', () => {
    const { html } = applySiteText(page('<header><a href="/x">Menu</a></header><main id="app"><p>Menu</p></main>'), { site: m([['text', 'Menu', 'Navigation']]), siteOutsideMainOnly: true });
    expect(html).toContain('<a href="/x">Navigation</a>');
    expect(html).toContain('<main id="app"><p>Menu</p></main>');
  });

  it('remplace les attributs (lien, image) et refuse les zones svg pour le texte', () => {
    const src = page('<a class="b" href="/a-propos">Lire</a><img src="/logo.png" alt="Logo" /><svg><text>Logo</text></svg>');
    const { html } = applySiteText(src, { page: m([['href', '/a-propos', 'https://exemple.org/'], ['src', '/logo.png', '/media/1'], ['text', 'Logo', 'X']]) });
    expect(html).toContain('<a class="b" href="https://exemple.org/">Lire</a>');
    expect(html).toContain('<img src="/media/1" alt="Logo" />');
    expect(html).toContain('<svg><text>Logo</text></svg>');
  });

  it('met à jour un compteur animé', () => {
    const { html } = applySiteText(page('<b data-count="4820">4 820</b><b data-count="40">40</b>'), { page: m([['text', '4 820', '5 000+'], ['text', '40', '9,8 Md']]) });
    expect(html).toContain('<b data-count="5000" data-suffix="+">5 000+</b>');
    expect(html).toContain('<b>9,8 Md</b>');
  });

  it('en mode édition, entoure les textes et signale les attributs', () => {
    const { html } = applySiteText(page('<a href="/x" data-count="3">Lien</a> · <p>Texte</p>'), { edit: true, page: m([['text', 'Texte', 'Modifié']]) });
    expect(html).toContain(`<a href="/x" data-cea-a="href:${keyOf('href', '/x')}:"><cea-t data-k="${keyOf('text', 'Lien')}">Lien</cea-t></a> · `);
    expect(html).toContain(`<cea-t data-k="${keyOf('text', 'Texte')}" data-s="p">Modifié</cea-t>`);
  });

  it('normalise les chemins et filtre les valeurs dangereuses', () => {
    expect(pageScope('/a-propos/')).toBe('/a-propos');
    expect(pageScope('/')).toBe('/');
    expect(safeAttr('href', 'javascript:alert(1)')).toBe(false);
    expect(safeAttr('href', 'https://www.linkedin.com/company/cea')).toBe(true);
    expect(safeAttr('src', 'data:image/png;base64,xx')).toBe(false);
  });
});
