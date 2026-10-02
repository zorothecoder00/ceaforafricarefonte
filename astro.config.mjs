// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cea4africa.com',
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
