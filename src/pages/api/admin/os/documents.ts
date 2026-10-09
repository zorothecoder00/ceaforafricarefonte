/* CEA OS — documents (cahier des charges CEA OS, 5.4 ; logique : src/lib/os/documents.ts).
   POST JSON ou multipart :
   { action: 'create', name, domain, confidentiality, templateId?, sourceRequest? } → document rédigé dans CEA OS (vierge ou depuis un modèle)
   { action: 'save', id, body, note? }          → nouvelle version du texte
   { action: 'upload', id, note?, file }        → nouvelle version (fichier)
   { action: 'restore', id, version }           → la version choisie devient une nouvelle version
   { action: 'submit', id }                     → validation par le circuit V02 (dossier « Document interne à valider »)
   { action: 'sign.start', id, signers[] }      → circuit de signature ordonné sur la version finale validée
   { action: 'sign', flowId, confirm }          → signature (nom complet saisi par le signataire)
   { action: 'sign.cancel', flowId }
   { action: 'template.save', id?, name, domain?, body } · { action: 'template.delete', id }  (managers, communication) */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/db';
import { osDocTemplate, osRequest } from '../../../../db/schema/os';
import { json, fail, audit, clientIp } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { canUse, inUserScope, MANAGERS } from '../../../../lib/os/core';
import { canSee, wfEnv } from '../../../../lib/os/approvals';
import { cancelSign, createTextDoc, docLink, newVersion, restoreVersion, saveTemplate, sign, startSign, submitDoc } from '../../../../lib/os/documents';
import { CONF } from '../../../../lib/os/support';
import { DK } from '../../../../lib/os/ref';

export const prerender = false;

const Id = z.uuid();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(2, 'Nommez le document.').max(200), domain: z.enum(DK as [string, ...string[]]), confidentiality: z.enum(CONF), templateId: Id.optional().or(z.literal('')), sourceRequest: z.string().max(40).optional().or(z.literal('')) }),
  z.object({ action: z.literal('save'), id: Id, body: z.string().max(400_000), note: z.string().trim().max(300).optional().default('') }),
  z.object({ action: z.literal('upload'), id: Id, note: z.string().trim().max(300).optional().default('') }),
  z.object({ action: z.literal('restore'), id: Id, version: z.coerce.number().int().min(1) }),
  z.object({ action: z.literal('submit'), id: Id }),
  z.object({ action: z.literal('sign.start'), id: Id, signers: z.preprocess((v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []), z.array(z.string().regex(/^EMP\d{3,6}$/)).min(1, 'Choisissez au moins un signataire.').max(10)) }),
  z.object({ action: z.literal('sign'), flowId: Id, confirm: z.string().trim().min(2, 'Saisissez votre nom complet.').max(160) }),
  z.object({ action: z.literal('sign.cancel'), flowId: Id }),
  z.object({ action: z.literal('template.save'), id: Id.optional().or(z.literal('')), name: z.string().trim().min(2).max(160), domain: z.enum(DK as [string, ...string[]]).optional().or(z.literal('')), body: z.string().min(10, 'Rédigez le modèle.').max(100_000) }),
  z.object({ action: z.literal('template.delete'), id: Id }),
]);

export const POST: APIRoute = async ({ locals, request }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData().catch(() => null) : null;
  const raw = form ? Object.fromEntries([...form.keys()].filter((k) => k !== 'file').map((k) => [k, form.getAll(k).length > 1 ? form.getAll(k) : form.get(k)])) : await request.json().catch(() => null);
  // Signataires ordonnés : champs signer1 … signer5 du formulaire → signers[]
  if (raw && typeof raw === 'object' && 'signer1' in raw) (raw as Record<string, unknown>).signers = [1, 2, 3, 4, 5].map((n) => (raw as Record<string, unknown>)[`signer${n}`]).filter((x) => typeof x === 'string' && x);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  let err: string | null = null;
  try {
    switch (b.action) {
      case 'create': {
        if (b.sourceRequest) {
          // Création depuis un dossier : il faut pouvoir voir ce dossier
          const [r] = await db.select().from(osRequest).where(eq(osRequest.id, b.sourceRequest));
          if (!r || !canSee(me, c.superuser, r, await wfEnv(), (x) => inUserScope(c, x))) return fail('Dossier d’origine introuvable.', 404);
        }
        const d = await createTextDoc(me, { name: b.name, domain: b.domain, confidentiality: b.confidentiality, templateId: b.templateId || undefined, sourceRequest: b.sourceRequest || undefined });
        return json({ ok: true, message: 'Document créé.', redirect: docLink(d.id) });
      }
      case 'save': err = await newVersion(b.id, me, c, { body: b.body, note: b.note }); break;
      case 'upload': {
        const file = form?.get('file');
        if (!(file instanceof File) || !file.size) return fail('Choisissez un fichier.');
        err = await newVersion(b.id, me, c, { file, note: b.note });
        break;
      }
      case 'restore': err = await restoreVersion(b.id, b.version, me, c); break;
      case 'submit': {
        const r = await submitDoc(b.id, me, c);
        if (r.error) return fail(r.error);
        return json({ ok: true, message: `Document soumis à la validation (dossier ${r.request}).` });
      }
      case 'sign.start': err = await startSign(b.id, b.signers, me, c); break;
      case 'sign': err = await sign(b.flowId, me, { confirm: b.confirm, ip: clientIp(request), userAgent: request.headers.get('user-agent') }); break;
      case 'sign.cancel': err = await cancelSign(b.flowId, me); break;
      case 'template.save':
      case 'template.delete': {
        if (!canUse(MANAGERS + ' com jur', c)) return fail('Modèles gérés par les managers, la communication et le juridique.', 403);
        if (b.action === 'template.delete') { await db.delete(osDocTemplate).where(eq(osDocTemplate.id, b.id)); await audit(me.userId, 'os.document.modele.suppression', b.id); return json({ ok: true, message: 'Modèle supprimé.' }); }
        await saveTemplate(me, { id: b.id || undefined, name: b.name, domain: b.domain || null, body: b.body });
        return json({ ok: true, message: 'Modèle enregistré.' });
      }
    }
  } catch (e) { return fail(e instanceof Error ? e.message : 'Opération impossible.'); }
  if (err) return fail(err);
  const msg: Record<string, string> = { save: 'Nouvelle version enregistrée.', upload: 'Nouvelle version déposée.', restore: 'Version restaurée (nouvelle version).', 'sign.start': 'Circuit de signature ouvert : le premier signataire est notifié.', sign: 'Signature enregistrée.', 'sign.cancel': 'Circuit de signature annulé.' };
  return json({ ok: true, message: msg[b.action] ?? 'Enregistré.' });
};
