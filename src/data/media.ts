/* Vidéos et épisodes audio publiés (CDC §5.1, §6, §7.3, §7.6). Renseigner l'adresse du média (titre exact → URL) :
   YouTube, Vimeo, fichier .mp4/.webm (avec sous-titres .vtt facultatifs) ou .mp3/.m4a.
   Sans adresse, le lecteur affiche « à venir » : aucun faux bouton de lecture (CDC §21). */
export type Media = { url: string; captions?: { lang: string; label: string; src: string }[] };

export const MEDIA: Record<string, Media> = {};

export const PRESIDENT_VIDEO = 'Le mot du Président';
export const LIVE_STREAM = 'Direct — salle principale';

/** Adresse d'intégration respectueuse de la vie privée pour YouTube et Vimeo, sinon null (fichier lu nativement). */
export function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0&cc_load_policy=1`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1&dnt=1`;
  return null;
}
