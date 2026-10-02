/* Version téléchargeable d'un modèle : document HTML au format Word (ouvert et modifiable par Word, LibreOffice et Google Docs). */
import type { APIRoute, GetStaticPaths } from 'astro';
import { MODELES, MODELE_AVERTISSEMENT, type Modele } from '../../../data/modeles';

export const getStaticPaths: GetStaticPaths = () => MODELES.map((m) => ({ params: { slug: m.slug }, props: { m } }));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = ({ props }) => {
  const m = (props as { m: Modele }).m;
  const body = m.sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}h1{font-size:16pt;text-align:center}h2{font-size:12pt;margin-top:14pt}.avert{border:1px solid #c9a227;padding:6pt;font-size:9pt}</style></head>
<body><p class="avert"><b>Avertissement.</b> ${esc(MODELE_AVERTISSEMENT)}</p><h1>${esc(m.title)}</h1>${body}
<p style="font-size:8pt;color:#666;margin-top:24pt">Modèle CEA FOR AFRICA — cea4africa.com/actionnariat/modeles</p></body></html>`;
  return new Response('﻿' + html, { headers: { 'Content-Type': 'application/msword; charset=utf-8', 'Content-Disposition': `attachment; filename="${m.slug}-cea.doc"` } });
};
