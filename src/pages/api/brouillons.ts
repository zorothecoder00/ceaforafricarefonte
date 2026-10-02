/* Brouillons des formulaires en étapes (CDC §10) : reprise sur un autre appareil pour les personnes connectées.
   GET ?form=<id>        → { logged, data, updatedAt }
   PUT { form, data }    → enregistre (64 Ko max.)
   DELETE ?form=<id>     → supprime après envoi */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { formDraft } from '../../db/schema/app';
import { json, fail, requireUser } from '../../lib/session';

export const prerender = false;

const FORM = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) return json({ ok: true, logged: false, data: null });
  const f = FORM.safeParse(url.searchParams.get('form'));
  if (!f.success) return fail('Formulaire inconnu.');
  const [d] = await db.select().from(formDraft).where(and(eq(formDraft.userId, locals.user.id), eq(formDraft.formId, f.data)));
  return json({ ok: true, logged: true, data: d?.data ?? null, updatedAt: d?.updatedAt ?? null });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const raw = await request.text();
  if (raw.length > 65_536) return fail('Brouillon trop volumineux.', 413);
  const p = z.object({ form: FORM, data: z.record(z.string(), z.union([z.string().max(10_000), z.boolean()])) }).safeParse(JSON.parse(raw || 'null'));
  if (!p.success) return fail('Brouillon invalide.');
  const now = new Date();
  await db.insert(formDraft).values({ userId: u.id, formId: p.data.form, data: p.data.data, updatedAt: now })
    .onConflictDoUpdate({ target: [formDraft.userId, formDraft.formId], set: { data: p.data.data, updatedAt: now } });
  return json({ ok: true, updatedAt: now });
};

export const DELETE: APIRoute = async ({ locals, url }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const f = FORM.safeParse(url.searchParams.get('form'));
  if (f.success) await db.delete(formDraft).where(and(eq(formDraft.userId, u.id), eq(formDraft.formId, f.data)));
  return json({ ok: true });
};
