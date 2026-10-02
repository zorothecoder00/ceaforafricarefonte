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
  pages/               Une route par page ; [...slug].astro affiche « bientôt disponible » pour les pages des menus pas encore développées
```
