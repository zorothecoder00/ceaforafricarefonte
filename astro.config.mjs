// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://cea4africa.com',
  // Pages statiques par défaut ; les routes marquées « prerender = false » (API d'authentification…) s'exécutent en fonctions Vercel.
  adapter: vercel(),
  // Français par défaut (sans préfixe), anglais sous /en/ (CDC §5.4 : FR et EN au lancement).
  // Les pages pas encore traduites sont rendues en français à leur adresse /en/… (repli « rewrite »),
  // avec l'en-tête et le pied de page en anglais et un bandeau d'information.
  i18n: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
    fallback: { en: 'fr' },
    routing: { prefixDefaultLocale: false, fallbackType: 'rewrite' },
  },
});
