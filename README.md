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

## Base de données et authentification

- **PostgreSQL + Drizzle** : schéma dans `src/db/schema/` — `auth.ts` (Better Auth), `app.ts` (plateforme), `kapital.ts` (schéma PostgreSQL séparé `kapital`, CDC §13). Migrations SQL versionnées dans `drizzle/`.
- **Better Auth** (`src/lib/auth.ts`, route `/api/auth/*`) : e-mail + mot de passe, téléphone + code SMS/WhatsApp (inscription automatique à la vérification). Google, Apple et LinkedIn s'activent dès que leurs identifiants sont renseignés. En local, les codes s'affichent dans la console du serveur ; le prestataire SMS se branche dans `src/lib/messaging.ts`.
- Le journal `audit_log` est en ajout seul (déclencheur SQL).
- Le schéma `neon_auth` présent sur Neon n'est pas géré par ce projet (filtré dans `drizzle.config.ts`).

| Commande | Effet |
| --- | --- |
| `npm run db:generate` | Génère une migration après modification du schéma |
| `npm run db:migrate` | Applique les migrations sur la base locale (`.env`) |
| `npm run db:migrate:prod` | Applique les migrations sur Neon (`.env.prod.bak`, connexion directe) |
| `npm run db:seed` | Données de démonstration — **base locale uniquement** (`-- --reset` pour recharger) |
| `npm run db:studio` | Explorateur Drizzle Studio |

Comptes de démonstration (local) : `admin@cea.demo`, `aicha@cea.demo`, `kwame@cea.demo`, `jeanmarc@cea.demo`, `ngozi@cea.demo`… — mot de passe `Demo-CEA-2026!`.

Variables à définir sur Vercel (production) : `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (adresse publique du site). `DATABASE_URL` est fournie par l'intégration Neon.
