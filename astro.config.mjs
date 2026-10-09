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
  // Serveur local : modules du client d'authentification pré-assemblés dès le démarrage. Découverts plus tard, Vite les
  // réassemblait en cours de route et les servait en 504 (« Outdated Optimize Dep ») : les boutons de /connexion restaient inertes.
  vite: {
    optimizeDeps: { include: ['better-auth/client', 'better-auth/client/plugins', '@better-auth/passkey/client'] },
  },
});
