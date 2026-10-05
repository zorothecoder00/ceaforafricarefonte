/* Optimisation des images déposées (CDC §13.1 : poids des pages ≤ 1 Mo, connexions mobiles lentes) :
   orientation corrigée, largeur ramenée à 1 600 px au plus, format WebP. Les métadonnées (EXIF, dont la position GPS des photos
   prises au téléphone) sont retirées. L'image n'est jamais agrandie. */
import sharp from 'sharp';

export const MAX_WIDTH = 1600;

export async function optimizeImage(file: File): Promise<File> {
  const input = Buffer.from(await file.arrayBuffer());
  const out = await sharp(input, { failOn: 'error' }).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  // Une image déjà légère et optimisée peut grossir en WebP : on garde la plus petite des deux
  if (out.length >= input.length && file.type === 'image/webp') return file;
  return new File([new Uint8Array(out)], file.name.replace(/\.(png|jpe?g|webp)$/i, '') + '.webp', { type: 'image/webp' });
}
