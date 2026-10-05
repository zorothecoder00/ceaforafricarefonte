/* Spécification OpenAPI 3.1 de l'API publique v1 (CDC §13 : API REST documentées, versionnement).
   Source unique : servie en JSON (/api/v1/openapi.json) et affichée sur la page /developpeurs. */
import { API_VERSION } from './public-api';

const page = [
  { name: 'limite', in: 'query', description: 'Éléments par page (1 à 100, 50 par défaut)', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { name: 'page', in: 'query', description: 'Numéro de page (à partir de 1)', schema: { type: 'integer', minimum: 1, default: 1 } },
];
const pays = { name: 'pays', in: 'query', description: 'Code pays ISO 3166-1 alpha-2 (ex. TG, CI, SN)', schema: { type: 'string', pattern: '^[A-Z]{2}$' } };
const envelope = (item: Record<string, unknown>, list = true) => ({
  type: 'object', required: ['data', 'meta'],
  properties: { data: list ? { type: 'array', items: item } : item, meta: { $ref: '#/components/schemas/Meta' } },
});
const errors = {
  '400': { description: 'Paramètre invalide', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erreur' } } } },
  '429': { description: 'Limite de débit atteinte (120 requêtes par minute et par adresse IP)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erreur' } } } },
};
const str = { type: 'string' }, int = { type: 'integer' }, bool = { type: 'boolean' }, nstr = { type: ['string', 'null'] };

export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'API publique CEA FOR AFRICA', version: API_VERSION,
    description: 'Données publiques de la plateforme pour les partenaires : programmes, événements, offres d’emploi et données d’impact ouvertes. Lecture seule, sans authentification, appelable depuis un navigateur (CORS). Les réponses sont en français.',
    contact: { name: 'CEA FOR AFRICA', url: 'https://cea4africa.com/contact' },
    license: { name: 'Données d’impact : CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/deed.fr' },
  },
  servers: [{ url: '/api/v1', description: 'Version 1' }],
  tags: [{ name: 'Programmes' }, { name: 'Événements' }, { name: 'Emplois' }, { name: 'Impact' }],
  paths: {
    '/programmes': { get: { tags: ['Programmes'], summary: 'Programmes et appels à candidatures', parameters: [{ name: 'statut', in: 'query', schema: { type: 'string', enum: ['ouvert', 'a_venir', 'clos'] } }, ...page],
      responses: { '200': { description: 'Liste paginée', content: { 'application/json': { schema: envelope({ $ref: '#/components/schemas/Programme' }) } } }, ...errors } } },
    '/evenements': { get: { tags: ['Événements'], summary: 'Événements publiés', parameters: [pays, { name: 'a_venir', in: 'query', description: '1 : seulement à venir', schema: { type: 'string', enum: ['1'] } }, { name: 'lang', in: 'query', schema: { type: 'string', enum: ['fr', 'en'], default: 'fr' } }, ...page],
      responses: { '200': { description: 'Liste paginée, triée par date', content: { 'application/json': { schema: envelope({ $ref: '#/components/schemas/Evenement' }) } } }, ...errors } } },
    '/emplois': { get: { tags: ['Emplois'], summary: 'Offres d’emploi et de stage publiées', parameters: [pays, { name: 'type', in: 'query', schema: { type: 'string', enum: ['CDI', 'CDD', 'Stage', 'Alternance', 'Freelance', 'Mission'] } }, { name: 'teletravail', in: 'query', schema: { type: 'string', enum: ['1'] } }, ...page],
      responses: { '200': { description: 'Liste paginée', content: { 'application/json': { schema: envelope({ $ref: '#/components/schemas/Emploi' }) } } }, ...errors } } },
    '/impact': { get: { tags: ['Impact'], summary: 'Données d’impact ouvertes (CC BY 4.0)', parameters: [pays],
      responses: { '200': { description: 'Indicateurs, emplois par trimestre, données par pays', content: { 'application/json': { schema: envelope({ $ref: '#/components/schemas/Impact' }, false) } } }, ...errors } } },
  },
  components: {
    schemas: {
      Meta: { type: 'object', properties: { version: str, generated_at: { type: 'string', format: 'date-time' }, total: int, page: int, limite: int, pages: int, licence: str, source: str, date_arrete: str } },
      Erreur: { type: 'object', required: ['error'], properties: { error: { type: 'object', properties: { code: str, message: str } } } },
      Programme: { type: 'object', properties: { id: str, titre: str, programme: str, statut: { type: 'string', enum: ['ouvert', 'a_venir', 'clos'] }, ouverture: nstr, cloture: nstr, description: str, url: { type: 'string', format: 'uri' } } },
      Evenement: { type: 'object', properties: { id: str, titre: str, date: { type: 'string', format: 'date' }, heure: nstr, ville: str, pays: str, pays_nom: str, format: str, description: str,
        lieu: { type: ['object', 'null'], properties: { nom: str, adresse: str, latitude: { type: 'number' }, longitude: { type: 'number' } } },
        billets: { type: 'array', items: { type: 'object', properties: { categorie: str, prix_xof: int } } }, url: { type: 'string', format: 'uri' } } },
      Emploi: { type: 'object', properties: { id: str, titre: str, entreprise: str, pays: str, pays_nom: str, type: str, teletravail: bool, diaspora: bool, remuneration: str, competences: { type: 'array', items: str }, debut: nstr, duree_mois: { type: ['integer', 'null'] }, url: { type: 'string', format: 'uri' } } },
      Impact: { type: 'object', properties: {
        indicateurs: { type: 'array', items: { type: 'object', properties: { id: str, libelle: str, valeur: { type: 'number' }, unite: str, definition: str, source: str, date_arrete: str } } },
        emplois_par_trimestre: { type: 'array', items: { type: 'object', properties: { trimestre: str, emplois: int } } },
        pays: { type: 'array', items: { type: 'object', properties: { code: str, pays: str, membres: int, projets: int, evenements: int } } },
      } },
    },
  },
} as const;
