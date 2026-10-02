/* Définir un mot de passe pour un compte créé par téléphone (nécessaire pour activer la double authentification). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { auth } from '../../../lib/auth';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const p = z.object({ newPassword: z.string().min(10).max(128) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Le mot de passe doit contenir au moins 10 caractères.');
  try {
    await auth.api.setPassword({ body: { newPassword: p.data.newPassword }, headers: request.headers });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Un mot de passe existe déjà : utilisez « Changer le mot de passe ».');
  }
  await audit(u.id, 'mot_de_passe.definition', u.id, {}, clientIp(request));
  return json({ ok: true, message: 'Mot de passe enregistré.' });
};
