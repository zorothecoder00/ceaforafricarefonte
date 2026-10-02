# CEA FOR AFRICA — site Astro

Refonte de la plateforme CEA FOR AFRICA (Connecter · Entreprendre · Agir) et de son portail financier **CEA Kapital Invest**, à partir du prototype fonctionnel.

> Toutes les données sont fictives : aucun paiement ni investissement réel n'est effectué.

## Démarrer

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # site statique dans dist/
npm run preview
```

## Structure

```
src/
  data/proto.ts        Données de démonstration (pays, cours, événements, offres, opportunités, menus…)
  data/site.ts         Navigation, marchés, helpers de formatage
  styles/global.css    Design system du prototype (couleurs, typographies Sora / Source Sans 3, thème sombre)
  scripts/app.ts       Interactions : thème, menu, devise, carte, votes, recherche Ctrl+K, CEA Copilot
  layouts/             BaseLayout (site) et KapitalLayout (zone sombre Kapital Invest)
  components/          En-tête, pied de page, carte de l'Afrique, ticker, cartes…
  data/nav.ts          Méga-menus (8 entrées, CDC §6) et réseaux sociaux
  pages/               Une route par page ; en/ pour les pages traduites
```

## Variables d'environnement

| Fichier | Rôle | Commité |
| --- | --- | --- |
| `.env` | Local : PostgreSQL `ceaforafrica` sur `localhost:5432` (utilisateur `postgres`) | non |
| `.env.prod.bak` | Sauvegarde des variables de production (base Neon du projet Vercel) | non |
| `.env.example` | Modèle à copier | oui |

En production, `DATABASE_URL` est injectée par l'intégration Neon de Vercel.

## Multilingue (FR / EN)

- Français par défaut (`/…`), anglais sous `/en/…` (configuration `i18n` dans `astro.config.mjs`).
- En-tête, pied de page, méga-menus, Copilot et accueil sont traduits (`src/i18n/ui.ts`, `src/i18n/content-en.ts`).
- Une page non encore traduite s'affiche en français à son adresse `/en/…`, avec un bandeau d'information ; ses liens internes restent en `/en/`.
- Pour traduire une page : créer `src/pages/en/<page>.astro` et ajouter son chemin à `TRANSLATED` dans `src/i18n/ui.ts`.

## Application installable (PWA)

- `public/manifest.webmanifest`, `public/sw.js` (actif en production uniquement), page `/hors-ligne`.
- Icônes : `node scripts/icons.mjs` régénère `public/icons/*.png`.
- Vidéo du héros de l'accueil : déposer `public/media/hero.mp4` (et `hero.jpg` en affiche) ; elle s'affiche automatiquement.
