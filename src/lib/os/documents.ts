/* CEA OS — documents (cahier des charges CEA OS, 5.4) :
   - DOC-01 : documents centralisés, rédigés dans CEA OS (texte) ou déposés (fichier) ; modèles par domaine ; création depuis un
     dossier du moteur de workflow (le dossier d'origine est conservé).
   - DOC-02 : chaque enregistrement crée une version numérotée (empreinte SHA-256, auteur, note) ; comparaison, restauration ;
     la version validée par le circuit V02 est archivée comme version finale (AUT-14).
   - DOC-03 : la classification (Public, Interne, Confidentiel, Strictement confidentiel) conditionne la consultation et le partage.
   - DOC-04 : CEA Sign (signature électronique simple, en attendant le prestataire prévu au point PO-04) : signataires dans
     l'ordre, sur la version finale figée ; chaque signature conserve l'empreinte, l'horodatage, l'adresse IP et la déclaration
     du signataire ; une empreinte qui ne correspond plus bloque la signature. Les signatures sont immuables en base. */
import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { osDocument, osDocVersion, osDocTemplate, osSignFlow, osSignature, osRequest } from '../../db/schema/os';
import { readStoredFile, storeFile } from '../storage';
import { audit } from '../session';
import { allStaff, type OsCtx, type Person } from './core';
import { advance, createRequest, notifyStaff, resubmit } from './approvals';
import { canSeeDoc } from './support';
import { fillTemplate } from './workspace-core';
import { DOM, isDom, pn, refT } from './ref';

export type Doc = typeof osDocument.$inferSelect;
export type Version = typeof osDocVersion.$inferSelect;
export const docLink = (id: string) => `/os/documents/${id}`;
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

/** Empreinte du contenu d'une version (texte ou fichier). */
export async function versionHash(v: Pick<Version, 'body' | 'storageKey' | 'sha256'>): Promise<string | null> {
  if (v.body != null) return sha(v.body);
  if (!v.storageKey) return null;
  const f = await readStoredFile(v.storageKey);
  return f ? sha(f.body) : null;
}
/** Contenu d'une version (la courante par défaut) prêt à servir : fichier déposé, ou texte rédigé dans CEA OS (Markdown). */
export async function contentOf(d: Doc, version?: number): Promise<{ body: Uint8Array; type: string; filename: string; version: number } | null> {
  const v = version ?? d.version;
  const [row] = await db.select().from(osDocVersion).where(and(eq(osDocVersion.documentId, d.id), eq(osDocVersion.version, v)));
  const base = d.name.replace(/[^\w.\- ]/g, '_');
  if (row?.body != null) return { body: new TextEncoder().encode(row.body), type: 'text/markdown; charset=utf-8', filename: base.endsWith('.md') ? base : `${base}.md`, version: v };
  const key = row?.storageKey || (v === d.version ? d.storageKey : '');
  const f = key ? await readStoredFile(key) : null;
  return f ? { body: f.body, type: f.type, filename: base, version: v } : null;
}
export const versions = (id: string) => db.select().from(osDocVersion).where(eq(osDocVersion.documentId, id)).orderBy(desc(osDocVersion.version));
export async function getDoc(id: string): Promise<Doc | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [d] = await db.select().from(osDocument).where(eq(osDocument.id, id));
  return d ?? null;
}
const editable = (d: Doc) => ['Brouillon', 'Déposé', 'À corriger', 'Validé', 'Signé'].includes(d.status);
const canEdit = (d: Doc, me: Person, c: Pick<OsCtx, 'superuser' | 'prof' | 'me'>) => (d.owner === me.id || d.by === me.id || c.superuser || me.prof === 'dg') && canSeeDoc(d, c);

/** Modèles applicables à un domaine (ceux du domaine et ceux de tous les domaines). */
export const templatesFor = async (domain?: string | null) => (await db.select().from(osDocTemplate)).filter((t) => !t.domain || t.domain === domain);

/** Nouveau document rédigé dans CEA OS, vierge ou depuis un modèle ; éventuellement rattaché à un dossier d'origine. */
export async function createTextDoc(me: Person, o: { name: string; domain: string; country?: string; confidentiality: string; templateId?: string; body?: string; sourceRequest?: string }): Promise<Doc> {
  let body = o.body ?? '';
  if (o.templateId) {
    const [t] = await db.select().from(osDocTemplate).where(eq(osDocTemplate.id, o.templateId));
    if (!t) throw new Error('Modèle introuvable.');
    const [src] = o.sourceRequest ? await db.select().from(osRequest).where(eq(osRequest.id, o.sourceRequest)) : [];
    body = fillTemplate(t.body, {
      titre: o.name, date: new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Lome' }), auteur: me.name, poste: refT(me.poste), pays: pn(o.country ?? me.country),
      domaine: isDom(o.domain) ? DOM[o.domain].n : o.domain, dossier: src ? `${src.id} — ${src.title}` : '', montant: src?.amount ? `${src.amount.toLocaleString('fr-FR')} FCFA` : '', description: src?.description ?? '',
    });
  }
  const [d] = await db.insert(osDocument).values({ name: o.name, domain: o.domain, country: o.country ?? me.country, confidentiality: o.confidentiality, version: 1, storageKey: '', mime: 'text/markdown', size: body.length, by: me.id, owner: me.id, kind: 'texte', status: 'Brouillon', templateId: o.templateId ?? null, sourceRequest: o.sourceRequest ?? null }).returning();
  await db.insert(osDocVersion).values({ documentId: d.id, version: 1, body, mime: 'text/markdown', size: body.length, sha256: sha(body), note: o.templateId ? 'Créé depuis un modèle' : 'Création', by: me.id });
  await audit(me.userId, 'os.document.depot', d.name, { kind: 'texte', modele: o.templateId ?? null, dossier: o.sourceRequest ?? null });
  return d;
}

/** Nouvelle version : texte modifié, ou fichier déposé. Un document validé ou signé modifié repasse en brouillon (sa version finale reste archivée). */
export async function newVersion(id: string, me: Person, c: Pick<OsCtx, 'superuser' | 'prof' | 'me'>, o: { body?: string; file?: File; note?: string }): Promise<string | null> {
  const d = await getDoc(id);
  if (!d) return 'Document introuvable.';
  if (!canEdit(d, me, c)) return 'Seul l’auteur du document (ou la Direction générale) le modifie.';
  if (!editable(d)) return `Document ${d.status.toLowerCase()} : attendez la fin du circuit avant de le modifier.`;
  const v = d.version + 1;
  let row: Omit<typeof osDocVersion.$inferInsert, 'documentId' | 'version'>;
  if (o.file) {
    const s = await storeFile(o.file, 'os/documents');
    const f = await readStoredFile(s.key);
    row = { storageKey: s.key, mime: s.type, size: s.size, sha256: f ? sha(f.body) : null, note: o.note ?? '', by: me.id };
    await db.update(osDocument).set({ version: v, storageKey: s.key, mime: s.type, size: s.size, kind: 'fichier', status: d.status === 'Déposé' ? 'Déposé' : 'Brouillon', updatedAt: new Date() }).where(eq(osDocument.id, id));
  } else {
    const body = o.body ?? '';
    const [last] = await versions(id);
    if (last?.body === body) return 'Aucune modification à enregistrer.';
    row = { body, mime: 'text/markdown', size: body.length, sha256: sha(body), note: o.note ?? '', by: me.id };
    await db.update(osDocument).set({ version: v, size: body.length, status: 'Brouillon', updatedAt: new Date() }).where(eq(osDocument.id, id));
  }
  await db.insert(osDocVersion).values({ documentId: id, version: v, ...row });
  await audit(me.userId, 'os.document.version', d.name, { version: v, note: o.note ?? '' });
  return null;
}

/** Restauration : la version choisie devient une nouvelle version (l'historique est conservé). */
export async function restoreVersion(id: string, version: number, me: Person, c: Pick<OsCtx, 'superuser' | 'prof' | 'me'>): Promise<string | null> {
  const [v] = await db.select().from(osDocVersion).where(and(eq(osDocVersion.documentId, id), eq(osDocVersion.version, version)));
  if (!v) return 'Version introuvable.';
  const d = await getDoc(id);
  if (!d) return 'Document introuvable.';
  if (!canEdit(d, me, c)) return 'Seul l’auteur du document (ou la Direction générale) le modifie.';
  if (!editable(d)) return `Document ${d.status.toLowerCase()} : attendez la fin du circuit.`;
  const nv = d.version + 1;
  await db.insert(osDocVersion).values({ documentId: id, version: nv, storageKey: v.storageKey, body: v.body, mime: v.mime, size: v.size, sha256: v.sha256, note: `Restauration de la version ${version}`, by: me.id });
  await db.update(osDocument).set({ version: nv, ...(v.storageKey ? { storageKey: v.storageKey, mime: v.mime } : {}), size: v.size, status: 'Brouillon', updatedAt: new Date() }).where(eq(osDocument.id, id));
  await audit(me.userId, 'os.document.version', d.name, { version: nv, restauration: version });
  return null;
}

/** Soumission de la version courante au circuit V02 (dossier « Document interne à valider ») ; nouvelle soumission si le dossier attend une correction. */
export async function submitDoc(id: string, me: Person, c: Pick<OsCtx, 'superuser' | 'prof' | 'me'>): Promise<{ error?: string; request?: string }> {
  const d = await getDoc(id);
  if (!d) return { error: 'Document introuvable.' };
  if (!canEdit(d, me, c)) return { error: 'Seul l’auteur du document le soumet à la validation.' };
  if (!['Brouillon', 'Déposé', 'À corriger'].includes(d.status)) return { error: `Document ${d.status.toLowerCase()}.` };
  const piece = { document: `${d.id}@v${d.version}` };
  if (d.validationRequest) {
    const [r] = await db.select().from(osRequest).where(eq(osRequest.id, d.validationRequest));
    if (r && ['À modifier', 'À corriger', 'Pièces demandées'].includes(r.status)) {
      await db.update(osRequest).set({ data: { ...r.data, documentId: d.id, version: d.version } }).where(eq(osRequest.id, r.id));
      const err = await resubmit(r.id, me, { pieces: piece });
      if (err) return { error: err };
      await db.update(osDocument).set({ status: 'En validation', updatedAt: new Date() }).where(eq(osDocument.id, id));
      return { request: r.id };
    }
  }
  const r = await createRequest(me, 'doc', { title: `Validation — ${d.name} (v${d.version})`, domain: d.domain, country: d.country ?? me.country, conf: d.confidentiality, pieces: piece, data: { documentId: d.id, version: d.version } });
  // Production → contrôle → validation : le dossier entre aussitôt dans le circuit
  for (let i = 0; i < 3; i++) {
    const [x] = await db.select().from(osRequest).where(eq(osRequest.id, r.id));
    if (!x || x.phase === 'validation') break;
    const err = await advance(r.id, me);
    if (err) return { error: err };
  }
  await db.update(osDocument).set({ status: 'En validation', validationRequest: r.id, updatedAt: new Date() }).where(eq(osDocument.id, id));
  return { request: r.id };
}

/** Effet d'une décision du circuit V02 sur le document (appelé par le moteur). */
export async function onDocDecision(r: typeof osRequest.$inferSelect, outcome: 'valide' | 'corriger' | 'rejete') {
  const docId = String(r.data.documentId ?? '');
  const d = await getDoc(docId);
  if (!d) return;
  if (outcome === 'valide') {
    // La version validée devient la version finale archivée : elle reste figée même si le document est modifié ensuite
    const v = Number(r.data.version) || d.version;
    await db.update(osDocument).set({ status: 'Validé', finalVersion: v, updatedAt: new Date() }).where(eq(osDocument.id, d.id));
    await db.update(osDocVersion).set({ note: `Version finale archivée (validation ${r.id})` }).where(and(eq(osDocVersion.documentId, d.id), eq(osDocVersion.version, v)));
  } else {
    await db.update(osDocument).set({ status: outcome === 'rejete' ? 'Brouillon' : 'À corriger', updatedAt: new Date() }).where(eq(osDocument.id, d.id));
  }
}

/* ===== CEA Sign ===== */
export const STATEMENT = (name: string, doc: string, v: number) => `Je soussigné·e ${name} déclare avoir pris connaissance du document « ${doc} » (version ${v}) et le signer.`;
/** Ouvre un circuit de signature ordonné sur la version finale validée. */
export async function startSign(id: string, signers: string[], me: Person, c: Pick<OsCtx, 'superuser' | 'prof' | 'me'>): Promise<string | null> {
  const d = await getDoc(id);
  if (!d) return 'Document introuvable.';
  if (!canEdit(d, me, c)) return 'Seul l’auteur du document lance la signature.';
  if (d.status !== 'Validé' || !d.finalVersion) return 'Seule la version finale d’un document validé peut être signée.';
  const people = await allStaff();
  const list = [...new Set(signers)];
  if (!list.length) return 'Choisissez au moins un signataire.';
  for (const sid of list) {
    const p = people.find((x) => x.id === sid);
    if (!p?.active) return 'Signataire inconnu ou inactif.';
    if (!canSeeDoc(d, { me: p, prof: p.prof, superuser: false })) return `${p.name} n’a pas accès à un document ${d.confidentiality.toLowerCase()}.`;
  }
  const [v] = await db.select().from(osDocVersion).where(and(eq(osDocVersion.documentId, id), eq(osDocVersion.version, d.finalVersion)));
  const h = v ? await versionHash(v) : null;
  if (!h) return 'Contenu de la version finale indisponible.';
  await db.insert(osSignFlow).values({ documentId: id, version: d.finalVersion, sha256: h, signers: list, createdBy: me.id });
  await db.update(osDocument).set({ status: 'En signature', updatedAt: new Date() }).where(eq(osDocument.id, id));
  await notifyStaff([list[0]], `À signer : ${d.name}`, docLink(id), people);
  await audit(me.userId, 'os.document.signature.circuit', d.name, { version: d.finalVersion, signataires: list.join(',') });
  return null;
}
/** Signature par le signataire attendu, après contrôle de l'empreinte de la version figée. */
export async function sign(flowId: string, me: Person, o: { confirm: string; ip?: string | null; userAgent?: string | null }): Promise<string | null> {
  const [f] = await db.select().from(osSignFlow).where(eq(osSignFlow.id, flowId));
  if (!f || f.status !== 'En cours') return 'Ce circuit de signature n’est plus ouvert.';
  if (f.signers[f.cur] !== me.id) return f.signers.includes(me.id) ? 'Ce n’est pas encore votre tour de signer.' : 'Vous n’êtes pas signataire de ce document.';
  if (o.confirm.trim().toLowerCase() !== me.name.trim().toLowerCase()) return 'Saisissez votre nom complet exactement comme indiqué pour signer.';
  const d = (await getDoc(f.documentId))!;
  const [v] = await db.select().from(osDocVersion).where(and(eq(osDocVersion.documentId, d.id), eq(osDocVersion.version, f.version)));
  const h = v ? await versionHash(v) : null;
  if (h !== f.sha256) return 'Le contenu de la version à signer ne correspond plus à son empreinte : signature bloquée, contactez l’informatique.';
  await db.insert(osSignature).values({ flowId, signer: me.id, name: me.name, poste: refT(me.poste), sha256: h, statement: STATEMENT(me.name, d.name, f.version), ip: o.ip ?? null, userAgent: o.userAgent?.slice(0, 300) ?? null });
  const cur = f.cur + 1, done = cur >= f.signers.length;
  await db.update(osSignFlow).set({ cur, status: done ? 'Signé' : 'En cours', completedAt: done ? new Date() : null }).where(eq(osSignFlow.id, flowId));
  const people = await allStaff();
  if (done) {
    await db.update(osDocument).set({ status: 'Signé', updatedAt: new Date() }).where(eq(osDocument.id, d.id));
    await notifyStaff([...new Set([d.owner ?? '', ...f.signers])].filter(Boolean), `Document signé par tous : ${d.name}`, docLink(d.id), people);
  } else await notifyStaff([f.signers[cur]], `À signer : ${d.name}`, docLink(d.id), people);
  await audit(me.userId, 'os.document.signature', d.name, { version: f.version, sha256: h });
  return null;
}
/** Annulation d'un circuit de signature par son initiateur (les signatures déjà apposées restent au certificat). */
export async function cancelSign(flowId: string, me: Person): Promise<string | null> {
  const [f] = await db.select().from(osSignFlow).where(eq(osSignFlow.id, flowId));
  if (!f || f.status !== 'En cours') return 'Ce circuit n’est plus ouvert.';
  if (f.createdBy !== me.id && me.prof !== 'dg') return 'Seul l’initiateur annule le circuit.';
  await db.update(osSignFlow).set({ status: 'Annulé', completedAt: new Date() }).where(eq(osSignFlow.id, flowId));
  await db.update(osDocument).set({ status: 'Validé', updatedAt: new Date() }).where(eq(osDocument.id, f.documentId));
  return null;
}
export const flowsOf = (docId: string) => db.select().from(osSignFlow).where(eq(osSignFlow.documentId, docId)).orderBy(desc(osSignFlow.createdAt));
export const signaturesOf = (flowId: string) => db.select().from(osSignature).where(eq(osSignature.flowId, flowId));

/* ===== Modèles ===== */
export async function saveTemplate(me: Person, o: { id?: string; name: string; domain?: string | null; body: string }) {
  if (o.id) await db.update(osDocTemplate).set({ name: o.name, domain: o.domain ?? null, body: o.body, updatedAt: new Date() }).where(eq(osDocTemplate.id, o.id));
  else await db.insert(osDocTemplate).values({ name: o.name, domain: o.domain ?? null, body: o.body, createdBy: me.id });
  await audit(me.userId, 'os.document.modele', o.name, { domaine: o.domain ?? 'tous' });
}
