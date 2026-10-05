/* Gestion documentaire (CDC §12) : droits par dossier (rôles lecteurs / rédacteurs), filigrane nominatif des PDF, liens de partage.
   L'administrateur (droit « documents » V) voit tout ; ailleurs, l'accès est accordé dossier par dossier selon les rôles.
   Un document confidentiel ne sort jamais sans filigrane : si le filigrane échoue, le téléchargement est refusé. */
import { randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { can } from './rbac';

type Folder = { readers: string[]; writers: string[] };
export const isDocAdmin = (roles: readonly string[]) => can(roles, 'documents', 'V');
export const canWrite = (f: Folder, roles: readonly string[]) => isDocAdmin(roles) || f.writers.some((r) => roles.includes(r));
export const canRead = (f: Folder, roles: readonly string[]) => canWrite(f, roles) || f.readers.some((r) => roles.includes(r));

/** Jeton de lien de partage (32 caractères, non devinable). */
export const shareToken = () => randomBytes(24).toString('base64url');

/** Filigrane : texte en diagonale au centre de chaque page et ligne de traçabilité en pied de page. */
export async function watermarkPdf(bytes: Uint8Array, text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  // Helvetica standard : on retire les caractères hors Latin-1 (le texte reste lisible)
  const safe = text.replace(/[^\x20-\x7E -ÿ]/g, '?');
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    // Taille ajustée pour que la diagonale tienne dans la page (85 % de la largeur et de la hauteur), quelle que soit la longueur du texte
    const unit = font.widthOfTextAtSize(safe, 1);
    const size = Math.max(8, Math.min(48, (width * 0.85) / (unit * Math.cos(Math.PI / 6)), (height * 0.85) / (unit * Math.sin(Math.PI / 6))));
    const w = unit * size;
    page.drawText(safe, { x: width / 2 - (w / 2) * Math.cos(Math.PI / 6), y: height / 2 - (w / 2) * Math.sin(Math.PI / 6), size, font, color: rgb(0.55, 0.55, 0.6), opacity: 0.22, rotate: degrees(30) });
    page.drawText(safe, { x: 24, y: 12, size: 7, font, color: rgb(0.4, 0.4, 0.45), opacity: 0.8 });
  }
  return pdf.save();
}

export const watermarkText = (who: string, at = new Date()) => `Confidentiel CEA - ${who} - ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
