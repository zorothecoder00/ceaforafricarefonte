// Génère les icônes PNG de l'application installable (PWA) à partir d'un SVG. Usage : node scripts/icons.mjs
import sharp from 'sharp';

const logo = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#082B4C"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M112 196 Q256 60 400 196" fill="none" stroke="#C9962B" stroke-width="30" stroke-linecap="round"/>
    <text x="256" y="350" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="168" fill="#FFFFFF">CEA</text>
  </g>
</svg>`;

const out = [
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/icon-512.png', 512, 0],
  ['public/icons/maskable-512.png', 512, 70], // zone de sécurité pour les icônes masquables
];
for (const [file, size, pad] of out) {
  await sharp(Buffer.from(logo(pad))).resize(size, size).png().toFile(file);
  console.log('✓', file);
}
