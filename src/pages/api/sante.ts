/* Point de santé pour la supervision (CDC §13, observabilité) : 200 si la plateforme répond, 503 si la base est indisponible.
   À brancher sur un service de surveillance externe (UptimeRobot, Better Stack…) qui mesure la disponibilité et alerte l'équipe.
   Public : état global, latence de la base, version. Équipe connectée : détail de chaque service. */
import type { APIRoute } from 'astro';
import { runChecks, overall, version, recordSample } from '../../lib/health';
import { isStaff } from '../../lib/rbac';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const checks = await runChecks();
  await recordSample(checks);
  const status = overall(checks);
  const base = checks.find((c) => c.id === 'base')!;
  const body = { status, version: version(), time: new Date().toISOString(), base_ms: base.ms ?? null, ...(locals.user && isStaff(locals.user.roles) ? { checks } : {}) };
  return new Response(JSON.stringify(body), { status: status === 'ko' ? 503 : 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
};
