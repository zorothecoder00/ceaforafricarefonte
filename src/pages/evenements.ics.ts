/* Flux d'abonnement au calendrier des événements CEA (webcal://…/evenements.ics), mis à jour à chaque publication. */
import type { APIRoute } from 'astro';
import { EVENTS } from '../data/site';
import { calendar } from '../lib/ics';

export const GET: APIRoute = ({ site }) => new Response(calendar(EVENTS, site?.origin), {
  headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="evenements-cea.ics"' },
});
