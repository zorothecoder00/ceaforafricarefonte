/* Pièces jointes des formulaires en étapes (CDC §10) : déposées juste après l'envoi du formulaire, rattachées au dossier créé.
   POST multipart { kind: 'candidature' | 'dossier', reference, label, folder?, file } — propriétaire uniquement.
     · dossier Kapital → data room du dossier (dossier « folder »)
     · candidature     → liste data.documents de la candidature
   GET ?ref=<référence>&i=<index> → téléchargement d'une pièce de candidature (candidat·e ou équipe programmes). */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { programmeApplication } from '../../db/schema/app';
import { dossier, dataRoomDocument, dataRoomFolderEnum } from '../../db/schema/kapital';
import { json, fail, requireUser, audit, clientIp } from '../../lib/session';
import { storeFile, readStoredFile } from '../../lib/storage';
import { scope } from '../../lib/rbac';

export const prerender = false;

type Doc = { label: string; name: string; key: string; size: number; at: string };
const clean = (s: string, n = 140) => s.replace(/[^\p{L}\p{N} ._()'-]/gu, '').slice(0, n);

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const form = await request.formData().catch(() => null);
  const kind = String(form?.get('kind') ?? ''), ref = String(form?.get('reference') ?? ''), label = clean(String(form?.get('label') ?? 'Document'), 80);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) return fail('Fichier manquant.');
  const name = clean(file.name) || 'document';

  if (kind === 'dossier') {
    const [d] = await db.select().from(dossier).where(and(eq(dossier.reference, ref), eq(dossier.ownerId, u.id)));
    if (!d) return fail('Dossier introuvable.', 404);
    const folder = String(form?.get('folder') ?? 'juridique');
    if (!(dataRoomFolderEnum.enumValues as readonly string[]).includes(folder)) return fail('Rubrique inconnue.');
    let st;
    try { st = await storeFile(file, `dataroom/${d.id}`); } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt impossible.'); }
    await db.insert(dataRoomDocument).values({ dossierId: d.id, folder: folder as 'juridique', name: `${label} — ${name}`, storageKey: st.key, version: 1, uploadedBy: u.id });
    await audit(u.id, 'kapital.dataroom.depot', d.reference, { name, folder, size: st.size }, clientIp(request));
    return json({ ok: true, message: `« ${name} » déposé dans la data room.` });
  }

  if (kind === 'candidature') {
    const [a] = await db.select().from(programmeApplication).where(and(eq(programmeApplication.reference, ref), eq(programmeApplication.userId, u.id)));
    if (!a) return fail('Candidature introuvable.', 404);
    const data = a.data as Record<string, unknown> & { documents?: Doc[] };
    if ((data.documents?.length ?? 0) >= 10) return fail('10 pièces jointes au maximum.');
    let st;
    try { st = await storeFile(file, `candidatures/${a.id}`); } catch (e) { return fail(e instanceof Error ? e.message : 'Dépôt impossible.'); }
    const documents = [...(data.documents ?? []), { label, name, key: st.key, size: st.size, at: new Date().toISOString() }];
    await db.update(programmeApplication).set({ data: { ...data, documents }, updatedAt: new Date() }).where(eq(programmeApplication.id, a.id));
    await audit(u.id, 'candidature.piece', a.reference, { name, size: st.size }, clientIp(request));
    return json({ ok: true, message: `« ${name} » joint à la candidature.` });
  }
  return fail('Type de pièce inconnu.');
};

export const GET: APIRoute = async ({ locals, url }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const [a] = await db.select().from(programmeApplication).where(eq(programmeApplication.reference, url.searchParams.get('ref') ?? ''));
  // Hors candidat·e : lecture de toutes les candidatures exigée (équipe programmes, admin) — pas la portée « propres » d'un employeur
  if (!a || (a.userId !== u.id && scope(u.roles, 'candidature', 'L') !== 'all')) return fail('Accès refusé.', 403);
  const doc = ((a.data as { documents?: Doc[] }).documents ?? [])[Number(url.searchParams.get('i'))];
  if (!doc) return fail('Pièce introuvable.', 404);
  const f = await readStoredFile(doc.key);
  if (!f) return fail('Fichier indisponible.', 404);
  if (a.userId !== u.id) await audit(u.id, 'candidature.piece.lecture', a.reference, { name: doc.name });
  return new Response(f.body as unknown as BodyInit, { headers: { 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.name)}"`, 'Cache-Control': 'private, no-store' } });
};
