/* CEA OS — demandes du collaborateur (prototype : Accueil et Mes demandes), soumises au circuit d'approbation.
   POST JSON ou multipart { type: 'conge', from, days, kind }
                          { type: 'ndf', title, amount, cat, domain, file (justificatif, obligatoire) }
                          { type: 'achat', title, amount, supplier? (FRN-…), item? (article en stock), qty?, domain }
                          { type: 'contrat', title, party, ctype, amount, domain, end? } → circuit juridique, puis signature
                          { type: 'dep', title, amount, domain, country, file? }
   → { ok, id, message } ; le circuit dépend du type, du montant et des seuils (Processus et seuils). */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, fail } from '../../../../lib/session';
import { osApi, type WithMe } from '../../../../lib/os/guard';
import { createRequest, circuit, engageBudget } from '../../../../lib/os/approvals';
import { scopeState } from '../../../../lib/os/core';
import { DK, PK, RTYPE, dstr, fcfa } from '../../../../lib/os/ref';
import { storeFile } from '../../../../lib/storage';

export const prerender = false;

const Amount = z.coerce.number().int('Montant entier en FCFA.').positive('Indiquez le montant.').max(1e12);
const Title = z.string().trim().min(3, 'Indiquez l’objet de la demande.').max(200);
const Dom = z.enum(DK as [string, ...string[]], { message: 'Domaine inconnu.' });
const Body = z.discriminatedUnion('type', [
  z.object({ type: z.literal('conge'), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indiquez la date de début.'), days: z.coerce.number().int().min(1, 'Indiquez le nombre de jours.').max(90), kind: z.enum(['Congé annuel', 'Congé maladie', 'Événement familial', 'Sans solde']) }),
  z.object({ type: z.literal('ndf'), title: Title, amount: Amount, cat: z.enum(['Transport', 'Repas', 'Hébergement', 'Autre']), domain: Dom }),
  z.object({ type: z.literal('achat'), title: Title, amount: Amount, supplier: z.string().trim().max(160).optional().default(''), item: z.string().trim().max(40).optional().default(''), qty: z.coerce.number().int().min(1).max(1e6).optional().default(1), domain: Dom }),
  z.object({ type: z.literal('contrat'), title: Title, party: z.string().trim().min(2, 'Indiquez le cocontractant.').max(200), ctype: z.enum(['Convention de partenariat', 'Prestation', 'Marché de travaux', 'Sous-traitance', 'Bail', 'Accord de confidentialité']), amount: z.coerce.number().int().min(0).max(1e12), domain: Dom, end: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default('') }),
  z.object({ type: z.literal('dep'), title: Title, amount: Amount, domain: Dom, country: z.enum(PK as [string, ...string[]], { message: 'Pays inconnu.' }) }),
]);

export const POST: APIRoute = async ({ locals, request, cookies }) => {
  const c = await osApi(locals.user, undefined, true);
  if (c instanceof Response) return c;
  const me = (c as WithMe).me;
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData().catch(() => null) : null;
  const raw = form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) : await request.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'Requête invalide.');
  const b = p.data;
  const file = form?.get('file');
  const hasFile = file instanceof File && file.size > 0;

  if (b.type === 'conge') {
    if (b.kind === 'Congé annuel' && b.days > me.leaveDays) return fail(`Solde insuffisant : ${me.leaveDays} jours disponibles.`);
    const r = await createRequest(me, 'conge', { title: `${b.kind} — ${b.days} jour(s) à partir du ${dstr(b.from)}`, data: { days: b.days, from: b.from, kind: b.kind } });
    return json({ ok: true, id: r.id, message: `Demande ${r.id} envoyée : ${circuit(r.steps)}.` });
  }
  if (b.type === 'ndf' && !hasFile) return fail('Ajoutez le justificatif.');
  if (b.type === 'dep') {
    if (!['rep', 'dirreg', 'chef', 'dg', 'agent', 'cond', 'fin'].includes(me.prof) && !c.superuser) return fail('Votre profil ne permet pas de soumettre une dépense.', 403);
    const sc = scopeState(c, cookies);
    if (!sc.inScope({ country: b.country, domain: b.domain })) return fail('Ce pays ou ce domaine est hors de votre périmètre.', 403);
  }
  let just: { key: string; name: string } | undefined;
  if (hasFile) {
    try { const s = await storeFile(file as File, `os/${b.type}`); just = { key: s.key, name: (file as File).name.slice(0, 160) }; }
    catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt du justificatif impossible.'); }
  }
  const data: Record<string, unknown> = { ...(just ? { just } : {}) };
  if (b.type === 'ndf') data.cat = b.cat;
  if (b.type === 'achat') Object.assign(data, { supplier: b.supplier, item: b.item, qty: b.qty });
  if (b.type === 'contrat') Object.assign(data, { party: b.party, ctype: b.ctype, end: b.end || null });
  const r = await createRequest(me, b.type, { title: b.title, amount: b.amount, domain: b.domain, country: b.type === 'dep' ? b.country : me.country, data });
  if (b.type === 'dep') await engageBudget(b.domain, b.amount); // dépense engagée dès la soumission
  return json({ ok: true, id: r.id, message: `${RTYPE[b.type]} ${r.id} (${fcfa(b.amount)}) ${b.type === 'contrat' ? 'soumis' : 'soumise'} : ${circuit(r.steps)}${b.type === 'contrat' ? ', puis signature' : ''}.` });
};
