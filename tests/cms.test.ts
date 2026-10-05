/* CMS éditorial (CDC §12) : rendu sûr des blocs, circuit de validation, publication programmée. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { renderBlocks, inline, videoEmbed, isLive, TRANSITIONS, Blocks, slugify, readingTime } = await import('../src/lib/cms');

describe('rendu des blocs', () => {
  it('échappe le HTML saisi et n’autorise que gras, italique et liens sûrs', () => {
    expect(inline('<script>alert(1)</script>')).not.toContain('<script>');
    expect(inline('**gras** et *italique*')).toBe('<strong>gras</strong> et <em>italique</em>');
    expect(inline('[site](https://cea.africa)')).toContain('href="https://cea.africa"');
    expect(inline('[interne](/academie)')).toBe('<a href="/academie">interne</a>');
    expect(inline('[piège](javascript:alert(1))')).not.toContain('href');
  });
  it('n’intègre que YouTube et Vimeo', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456');
    expect(videoEmbed('https://exemple.com/video')).toBeNull();
    expect(renderBlocks([{ t: 'video', url: 'https://exemple.com/x' }])).toBe('');
  });
  it('rend chaque type de bloc', () => {
    const html = renderBlocks([
      { t: 'h', text: 'Titre <b>', level: 2 }, { t: 'p', text: 'Ligne 1\nLigne 2' }, { t: 'list', items: ['a', '', 'b'], ordered: true },
      { t: 'quote', text: 'Citation', cite: 'Awa' }, { t: 'callout', text: 'Note', tone: 'gold' },
    ]);
    expect(html).toContain('<h2>Titre &lt;b&gt;</h2>');
    expect(html).toContain('Ligne 1<br>Ligne 2');
    expect(html).toContain('<ol><li>a</li><li>b</li></ol>');
    expect(html).toContain('— Awa');
    expect(html).toContain('tone-gold');
  });
  it('refuse un bloc inconnu ou mal formé', () => {
    expect(Blocks.safeParse([{ t: 'html', html: '<iframe>' }]).success).toBe(false);
    expect(Blocks.safeParse([{ t: 'image', mediaId: 'pas-un-uuid', caption: '' }]).success).toBe(false);
  });
});

describe('circuit de validation', () => {
  it('la relecture et la publication exigent le droit de valider', () => {
    expect(TRANSITIONS.brouillon.map((t) => t.to)).toEqual(['en_relecture']);
    expect(TRANSITIONS.brouillon[0].needs).toBe('edit');
    for (const t of [...TRANSITIONS.en_relecture, ...TRANSITIONS.valide, ...TRANSITIONS.programme, ...TRANSITIONS.publie]) expect(t.needs).toBe('validate');
    expect(TRANSITIONS.brouillon.some((t) => t.to === 'publie')).toBe(false);
  });
  it('un contenu programmé devient visible à sa date', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    expect(isLive({ status: 'programme', publishAt: new Date('2026-10-05T09:00:00Z') }, now)).toBe(true);
    expect(isLive({ status: 'programme', publishAt: new Date('2026-10-06T09:00:00Z') }, now)).toBe(false);
    expect(isLive({ status: 'valide', publishAt: null }, now)).toBe(false);
    expect(isLive({ status: 'publie', publishAt: null }, now)).toBe(true);
  });
  it('identifiant d’URL et temps de lecture', () => {
    expect(slugify('Côte d’Ivoire : l’export en 2026 !')).toBe('cote-d-ivoire-l-export-en-2026');
    expect(readingTime([{ t: 'p', text: 'mot '.repeat(600) }])).toBe('3 min');
  });
});
