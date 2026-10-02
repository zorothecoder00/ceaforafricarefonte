/* Génération de QR codes en SVG (cartes de membre, billets, certificats). */
import QRCode from 'qrcode';

export const qrSvg = (text: string) => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#082B4C', light: '#FFFFFF' } });

/** URL publique de vérification. */
export const verifyUrl = (origin: string, kind: 'carte' | 'certificat' | 'billet', id: string) => new URL(`/verifier/${kind}/${encodeURIComponent(id)}`, origin).href;
