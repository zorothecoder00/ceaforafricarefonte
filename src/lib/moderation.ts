/* Filtres de modération (back-office › Modération › Filtres) : une publication de la communauté qui contient l'une des
   expressions choisies par l'équipe (ou un numéro WhatsApp) est retenue avant publication ; un avis de cours avec un lien aussi.
   Comparaison sans majuscules ni accents ; « * » remplace quelques mots quelconques (ex. « crypto*doubl »). */
import { getSetting } from './settings';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();
const pattern = (w: string) => fold(w).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.{0,30}');

/** Expression du texte qui déclenche la retenue, ou null si la publication peut paraître directement. */
export async function suspectReason(text: string): Promise<string | null> {
  const f = await getSetting('moderation');
  const t = fold(text);
  for (const w of f.words) if (new RegExp(pattern(w)).test(t)) return w;
  if (f.whatsapp && /whatsapp\s*:?\s*\+?\d[\d\s]{7,}/.test(t)) return 'numéro WhatsApp';
  return null;
}

/** Un avis de cours contenant un lien internet est retenu (si l'équipe a gardé cette règle). */
export async function reviewHeld(comment: string | null): Promise<boolean> {
  if (!comment) return false;
  return (await getSetting('moderation')).reviewLinks && /https?:\/\/|www\./i.test(comment);
}
