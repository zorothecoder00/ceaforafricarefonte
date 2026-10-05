/* API du paramétrage (CDC §12). Droits : objet « parametres » (§18). Chaque modification est journalisée.
   POST { action, … } :
   - setting.save { key, value }        → identité légale, fiscalité, comptabilité
   - template.save { key, body } · template.reset { key } → modèles de messages
   - redirect.save { fromPath, toUrl, code } · redirect.delete { id } → redirections d'adresses */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { messageTemplate, redirect } from '../../../db/schema/finance';
import { json, fail, audit, clientIp } from '../../../lib/session';
import { staffApi } from '../../../lib/admin';
import { SETTINGS, setSetting, type SettingKey } from '../../../lib/settings';
import { TEMPLATES, invalidateTemplates } from '../../../lib/templates';
import { invalidateRedirects, normPath } from '../../../lib/redirects';

export const prerender = false;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setting.save'), key: z.enum(Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]]), value: z.unknown() }),
  z.object({ action: z.literal('template.save'), key: z.string().refine((k) => k in TEMPLATES), body: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal('template.reset'), key: z.string().refine((k) => k in TEMPLATES) }),
  z.object({ action: z.literal('redirect.save'), fromPath: z.string().trim().regex(/^\/[a-z0-9/_.-]*$/i, 'Adresse de départ : commence par « / »').max(200), toUrl: z.string().trim().max(500), code: z.union([z.literal(301), z.literal(302)]) }),
  z.object({ action: z.literal('redirect.delete'), id: z.uuid() }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail('Vérifiez le formulaire : ' + p.error.issues.map((i) => i.message).join(', '));
  const b = p.data;
  const u = staffApi(locals.user, 'parametres', 'M');
  if (u instanceof Response) return u;
  const ip = clientIp(request);

  switch (b.action) {
    case 'setting.save': {
      const r = SETTINGS[b.key].schema.safeParse(b.value);
      if (!r.success) return fail('Valeurs invalides : ' + r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', '));
      await setSetting(b.key, r.data as never, u.id);
      await audit(u.id, 'parametrage.reglage', b.key, {}, ip);
      return json({ ok: true, message: 'Réglages enregistrés.' });
    }
    case 'template.save': {
      // Les variables utilisées doivent exister pour ce modèle (sinon elles resteraient vides)
      const known = TEMPLATES[b.key as keyof typeof TEMPLATES].vars as readonly string[];
      const unknown = [...b.body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((v) => !known.includes(v));
      if (unknown.length) return fail(`Variable inconnue : {${unknown[0]}}. Variables possibles : ${known.map((v) => `{${v}}`).join(', ')}.`);
      await db.insert(messageTemplate).values({ key: b.key, body: b.body, updatedBy: u.id }).onConflictDoUpdate({ target: messageTemplate.key, set: { body: b.body, updatedBy: u.id, updatedAt: new Date() } });
      invalidateTemplates();
      await audit(u.id, 'parametrage.modele', b.key, {}, ip);
      return json({ ok: true, message: 'Modèle enregistré.' });
    }
    case 'template.reset': {
      await db.delete(messageTemplate).where(eq(messageTemplate.key, b.key));
      invalidateTemplates();
      await audit(u.id, 'parametrage.modele.reinitialisation', b.key, {}, ip);
      return json({ ok: true, message: 'Texte par défaut rétabli.' });
    }
    case 'redirect.save': {
      const from = normPath(b.fromPath);
      if (/^\/(api|admin|espace|_astro|media)(\/|$)/.test(from) || from === '/') return fail('Cette adresse ne peut pas être redirigée.');
      const internal = b.toUrl.startsWith('/');
      if (!internal && !/^https:\/\/[^\s]+$/.test(b.toUrl)) return fail('Destination : une adresse du site (« /… ») ou un lien https://…');
      if (internal && normPath(b.toUrl.split('?')[0]) === from) return fail('La destination est identique au départ.');
      // Pas de chaîne ni de boucle : la destination ne doit pas être elle-même redirigée
      if (internal) { const [chain] = await db.select({ id: redirect.id }).from(redirect).where(eq(redirect.fromPath, normPath(b.toUrl.split('?')[0]))); if (chain) return fail('La destination est elle-même redirigée : indiquez directement l’adresse finale.'); }
      const [into] = await db.select({ from: redirect.fromPath }).from(redirect).where(eq(redirect.toUrl, from));
      if (into) return fail(`L’adresse ${into.from} redirige déjà vers ${from} : modifiez-la plutôt pour éviter une chaîne.`);
      await db.insert(redirect).values({ fromPath: from, toUrl: b.toUrl, code: b.code, createdBy: u.id }).onConflictDoUpdate({ target: redirect.fromPath, set: { toUrl: b.toUrl, code: b.code } });
      invalidateRedirects();
      await audit(u.id, 'parametrage.redirection', from, { to: b.toUrl, code: b.code }, ip);
      return json({ ok: true, message: 'Redirection enregistrée (active sous une minute).' });
    }
    case 'redirect.delete': {
      await db.delete(redirect).where(eq(redirect.id, b.id));
      invalidateRedirects();
      await audit(u.id, 'parametrage.redirection.suppression', b.id, {}, ip);
      return json({ ok: true, message: 'Redirection supprimée.' });
    }
  }
};
