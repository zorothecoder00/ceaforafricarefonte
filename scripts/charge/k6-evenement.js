// Test de charge (CDC §13.1 : 10 000 utilisateurs simultanés lors des grands événements, API ≤ 300 ms au 95e percentile).
// Outil : k6 (https://k6.io). À lancer contre un environnement d'aperçu Vercel, jamais contre la production sans prévenir l'équipe.
//   k6 run -e BASE=https://<aperçu>.vercel.app -e VUS=500 scripts/charge/k6-evenement.js       (répétition)
//   k6 run -e BASE=https://<aperçu>.vercel.app -e VUS=10000 scripts/charge/k6-evenement.js     (cible du cahier des charges, k6 Cloud conseillé)
// Scénario : le parcours d'un visiteur le jour d'un grand événement — accueil, liste et fiche de l'événement, API publique, statut.
import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:4321';
const VUS = Number(__ENV.VUS || 200);
const EVENT = __ENV.EVENT || 'e1';

export const options = {
  scenarios: {
    pic: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: Math.round(VUS / 4) }, // montée progressive
        { duration: '3m', target: VUS }, // pic (ouverture de la billetterie)
        { duration: '5m', target: VUS }, // plateau
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // moins de 1 % d'erreurs
    'http_req_duration{type:api}': ['p(95)<300'], // lectures courantes de l'API ≤ 300 ms au 95e percentile
    'http_req_duration{type:page}': ['p(95)<1500'], // pages rendues côté serveur
  },
};

export default function () {
  group('visiteur', () => {
    const page = (path) => check(http.get(`${BASE}${path}`, { tags: { type: 'page' } }), { [`${path} 200`]: (r) => r.status === 200 });
    const api = (path) => check(http.get(`${BASE}${path}`, { tags: { type: 'api' } }), { [`${path} 200`]: (r) => r.status === 200 || r.status === 429 });
    page('/');
    sleep(1 + Math.random() * 2);
    page('/evenements');
    sleep(1 + Math.random() * 2);
    page(`/evenements/${EVENT}`);
    api('/api/v1/evenements?a_venir=1');
    api('/api/recherche?lang=fr');
    sleep(2 + Math.random() * 3);
    if (Math.random() < 0.05) api('/api/sante');
  });
}
