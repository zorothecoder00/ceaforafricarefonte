/* CEA OS — dossiers soumis au moteur de workflow (cahier des charges CEA OS, section 4).
   POST JSON ou multipart (pièces jointes : champs « piece_<clé> ») :
   { action: 'create', type, title, description?, amount?, country, countries?[], domain, conf, risk, strategic?, due?, owner? }
   { action: 'advance', id, proof?, lesson? }       → phase suivante (la validation soumet le dossier au circuit)
   { action: 'props', id, owner?, due?, nextAction? } → propriétés obligatoires (responsable, échéance, prochaine action)
   { action: 'pieces', id }                          → dépôt de pièces (multipart)
   { action: 'resubmit', id }                        → nouvelle version après modification demandée, rejet à corriger ou pièces manquantes
   { action: 'decide', id, decision: approuve | rejete | modifier, com? } → motif obligatoire pour rejeter ou demander une modification */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osRequest } from '../../../../db/schema/os';
import { json, fail } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { scopeState } from '../../../../lib/os/core';
import { advance, createRequest, decide, resubmit, setProps, wfConfig, objLink } from '../../../../lib/os/approvals';
import { DK, PK } from '../../../../lib/os/ref';
import { storeFile } from '../../../../lib/storage';

export const prerender = false;

const Id = z.string().trim().min(4).max(40);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ.');
const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []);
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'), type: z.string().min(2).max(30), title: z.string().trim().min(3, 'Indiquez l’intitulé du dossier.').max(200),
    description: z.string().trim().max(4000).optional().default(''), amount: z.coerce.number().int().min(0).max(1e13).optional().default(0),
    country: z.enum(PK as [string, ...string[]], { message: 'Pays inconnu.' }), countries: z.preprocess(list, z.array(z.enum(PK as [string, ...string[]])).max(20)).optional().default([]),
    domain: z.enum(DK as [string, ...string[]], { message: 'Domaine inconnu.' }), conf: z.enum(['Public', 'Interne', 'Confidentiel', 'Strictement confidentiel']).default('Interne'),
    risk: z.enum(['faible', 'normal', 'eleve', 'critique']).default('normal'), strategic: z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean()).default(false),
    due: Day.optional().or(z.literal('')), owner: z.string().regex(/^EMP\d{3,6}$/).optional().or(z.literal('')),
  }),
  z.object({ action: z.literal('advance'), id: Id, proof: z.string().trim().max(1000).optional(), lesson: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal('props'), id: Id, owner: z.string().regex(/^EMP\d{3,6}$/).optional().or(z.literal('')), due: Day.optional().or(z.literal('')), nextAction: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal('pieces'), id: Id }),
  z.object({ action: z.literal('resubmit'), id: Id }),
  z.object({ action: z.literal('decide'), id: Id, decision: z.enum(['approuve', 'rejete', 'modifier']), com: z.string().trim().max(1000).optional().default('') }),
]);

/** Pièces jointes « piece_<clé> » du formulaire → { clé: fichier stocké }. */
async function pieces(form: FormData | null, folder: string): Promise<Record<string, string> | string> {
  const out: Record<string, string> = {};
  if (!form) return out;
  for (const [k, v] of form.entries()) {
    if (!k.startsWith('piece_') || !(v instanceof File) || !v.size) continue;
    try { out[k.slice(6)] = (await storeFile(v, folder)).key; }
    catch (e) { return e instanceof Error ? e.message : 'Dépôt de la pièce impossible.'; }
  }
  return out;
}

export const POST: APIRoute = async ({ locals, request, cookies }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData().catch(() => null) : null;
  const raw = form ? Object.fromEntries([...form.keys()].filter((k) => !k.startsWith('piece_')).map((k) => [k, form.getAll(k).length > 1 ? form.getAll(k) : form.get(k)])) : await request.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;

  if (b.action === 'create') {
    const cfg = await wfConfig();
    const t = cfg.types.get(b.type);
    if (!t || !t.active || !t.generic) return fail('Type de dossier inconnu ou réservé à un formulaire dédié.');
    const sc = scopeState(c, cookies);
    if (!c.superuser && !sc.inScope({ country: b.country, domain: b.domain })) return fail('Ce pays ou ce domaine est hors de votre périmètre.', 403);
    const pc = await pieces(form, `os/${b.type}`);
    if (typeof pc === 'string') return fail(pc);
    try {
      const r = await createRequest(me, b.type, {
        title: b.title, description: b.description, amount: b.amount, country: b.country, countries: b.countries, domain: b.domain, conf: b.conf, risk: b.risk, strategic: b.strategic,
        due: b.due ? new Date(b.due + 'T23:59:00') : undefined, owner: b.owner || undefined, pieces: pc,
      });
      return json({ ok: true, id: r.id, message: `Dossier ${r.id} créé.`, redirect: objLink(r.id) });
    } catch (e) { return fail(e instanceof Error ? e.message : 'Création impossible.'); }
  }

  const [r] = await db.select().from(osRequest).where(eq(osRequest.id, b.id));
  if (!r) return fail('Dossier introuvable.', 404);
  let err: string | null = null;
  if (b.action === 'advance') err = await advance(b.id, me, { proof: b.proof, lesson: b.lesson });
  if (b.action === 'props') err = await setProps(b.id, me, { owner: b.owner || undefined, due: b.due ? new Date(b.due + 'T23:59:00') : undefined, nextAction: b.nextAction });
  if (b.action === 'pieces' || b.action === 'resubmit') {
    const pc = await pieces(form, `os/${r.type}`);
    if (typeof pc === 'string') return fail(pc);
    if (b.action === 'pieces') {
      if (!Object.keys(pc).length) return fail('Ajoutez au moins une pièce.');
      err = await setProps(b.id, me, { pieces: pc });
    } else err = await resubmit(b.id, me, { pieces: pc });
  }
  if (b.action === 'decide') err = await decide(b.id, me, b.decision, b.com);
  if (err) return fail(err);
  const msg = { advance: 'Dossier avancé.', props: 'Enregistré.', pieces: 'Pièce(s) ajoutée(s).', resubmit: 'Dossier soumis à nouveau.', decide: b.action === 'decide' ? { approuve: 'Approuvé : l’étape suivante est notifiée.', rejete: 'Rejet notifié.', modifier: 'Modification demandée à l’auteur.' }[b.decision] : '' }[b.action];
  return json({ ok: true, message: msg });
};
