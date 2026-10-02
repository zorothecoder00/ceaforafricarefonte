/* Stockage des fichiers (CDC §13 : stockage objet compatible S3, chiffré). Documents privés par défaut.
   - Production : S3 compatible (AWS S3, Cloudflare R2, Scaleway, OVH…) — S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION.
     Chiffrement côté serveur demandé à chaque dépôt (SSE AES256).
   - Développement sans S3 : dossier local .uploads/ (ignoré par Git).
   Contrôles : taille maximale, types autorisés, signature de fichier (« magic bytes ») pour écarter les fichiers déguisés.
   L'analyse antivirus se branche dans scanFile() (ex. ClamAV / service du fournisseur de stockage). */
import { AwsClient } from 'aws4fetch';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env, isProd } from './env';

export const MAX_BYTES = 15 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: number[][] }> = {
  'application/pdf': { ext: 'pdf', magic: [[0x25, 0x50, 0x44, 0x46]] },
  'image/png': { ext: 'png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/jpeg': { ext: 'jpg', magic: [[0xff, 0xd8, 0xff]] },
  'image/webp': { ext: 'webp', magic: [[0x52, 0x49, 0x46, 0x46]] },
  // DOCX, XLSX, PPTX : archives ZIP
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', magic: [[0x50, 0x4b, 0x03, 0x04]] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', magic: [[0x50, 0x4b, 0x03, 0x04]] },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', magic: [[0x50, 0x4b, 0x03, 0x04]] },
};

const s3 = () => {
  const accessKeyId = env('S3_ACCESS_KEY_ID'), secretAccessKey = env('S3_SECRET_ACCESS_KEY'), endpoint = env('S3_ENDPOINT'), bucket = env('S3_BUCKET');
  return accessKeyId && secretAccessKey && endpoint && bucket ? { client: new AwsClient({ accessKeyId, secretAccessKey, region: env('S3_REGION') ?? 'auto', service: 's3' }), base: `${endpoint.replace(/\/$/, '')}/${bucket}` } : null;
};
const LOCAL = path.resolve('.uploads');

/** Analyse antivirus : branchez ici le service retenu. Renvoie true si le fichier est sain. */
async function scanFile(_bytes: Uint8Array): Promise<boolean> {
  return true;
}

export async function storeFile(file: File, folder: string): Promise<{ key: string; type: string; size: number }> {
  if (file.size > MAX_BYTES) throw new Error('Fichier trop volumineux (15 Mo maximum).');
  const t = TYPES[file.type];
  if (!t) throw new Error('Format non accepté (PDF, DOCX, XLSX, PPTX, PNG, JPG, WEBP).');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!t.magic.some((m) => m.every((b, i) => bytes[i] === b))) throw new Error('Le contenu du fichier ne correspond pas à son format.');
  if (!(await scanFile(bytes))) throw new Error('Fichier refusé par l’analyse antivirus.');
  const key = `${folder.replace(/[^a-z0-9/_-]/gi, '')}/${randomUUID()}.${t.ext}`;
  const c = s3();
  if (c) {
    const res = await c.client.fetch(`${c.base}/${key}`, { method: 'PUT', body: bytes, headers: { 'Content-Type': file.type, 'x-amz-server-side-encryption': 'AES256' } });
    if (!res.ok) throw new Error(`Stockage indisponible (${res.status}).`);
  } else {
    if (isProd()) throw new Error("Aucun stockage de fichiers n'est configuré (S3_*).");
    await mkdir(path.join(LOCAL, path.dirname(key)), { recursive: true });
    await writeFile(path.join(LOCAL, key), bytes);
  }
  return { key, type: file.type, size: file.size };
}

export async function readStoredFile(key: string): Promise<{ body: Uint8Array; type: string } | null> {
  if (key.includes('..')) return null;
  const ext = key.split('.').pop() ?? '';
  const type = Object.entries(TYPES).find(([, v]) => v.ext === ext)?.[0] ?? 'application/octet-stream';
  const c = s3();
  if (c) {
    const res = await c.client.fetch(`${c.base}/${key}`);
    return res.ok ? { body: new Uint8Array(await res.arrayBuffer()), type } : null;
  }
  try {
    return { body: new Uint8Array(await readFile(path.join(LOCAL, key))), type };
  } catch {
    return null;
  }
}
