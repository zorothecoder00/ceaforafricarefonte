/* Flux d'abonnement au calendrier des événements CEA (webcal://…/evenements.ics), mis à jour à chaque publication. */
import type { APIRoute } from 'astro';
import { allEvents } from '../lib/catalog';
import { calendar } from '../lib/ics';

export const prerender = false;

export const GET: APIRoute = async ({ site }) => new Response(calendar(await allEvents(), site?.origin), {
  headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="evenements-cea.ics"' },
});
