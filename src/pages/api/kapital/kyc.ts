/* Vérification de l'investisseur (CDC §8.10) — multipart :
   q1, q2, q3 (questionnaire d'adéquation), origine, document (pièce d'identité), selfie.
   Les pièces sont stockées chiffrées dans kyc/<utilisateur> et ne sont lisibles que par le responsable conformité.
   Un prestataire KYC spécialisé (pièces africaines, détection du vivant, sanctions/PEP) se branche via KYC_PROVIDER ;
   à défaut, les contrôles sont traités manuellement par la conformité dans le back-office. */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { investorProfile, kycCheck } from '../../../db/schema/kapital';
import { userRole } from '../../../db/schema/app';
import { json, fail, requireUser, audit, clientIp } from '../../../lib/session';
import { storeFile } from '../../../lib/storage';
import { notify } from '../../../lib/notify';
import { env } from '../../../lib/env';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = requireUser(locals.user);
  if (u instanceof Response) return u;
  const f = await request.formData().catch(() => null);
  if (!f) return fail('Formulaire invalide.');
  const q = [f.get('q1'), f.get('q2'), f.get('q3')].map((x) => Number(x));
  const origine = String(f.get('origine') ?? '');
  const doc = f.get('document'), selfie = f.get('selfie');
  if (q.some((x) => !Number.isInteger(x) || x < 0 || x > 2)) return fail('Répondez aux trois questions du profil investisseur.');
  if (!(doc instanceof File) || !doc.size || !(selfie instanceof File) || !selfie.size) return fail('Ajoutez la photo de votre pièce d’identité et un selfie.');
  if (!origine) return fail('Indiquez l’origine principale des fonds.');
  // Catégorisation (CDC §8.10) : expérience, part de l'épargne, capacité à supporter des pertes
  const category = q[0] === 2 && q[2] === 0 ? 'professionnel' : q[0] >= 1 && q[2] < 2 ? 'averti' : 'particulier';
  try {
    await storeFile(doc, `kyc/${u.id}`);
    await storeFile(selfie, `kyc/${u.id}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Dépôt des pièces impossible.');
  }
  const provider = env('KYC_PROVIDER') ?? 'manuel';
  await db.insert(investorProfile).values({ userId: u.id, category, kycStatus: 'en_cours' }).onConflictDoUpdate({ target: investorProfile.userId, set: { category, kycStatus: 'en_cours' } });
  await db.insert(kycCheck).values(['identite', 'vivacite', 'sanctions', 'pep', 'origine_fonds'].map((kind) => ({ userId: u.id, kind: kind as 'identite', provider, providerRef: kind === 'origine_fonds' ? origine.slice(0, 80) : null })));
  await audit(u.id, 'kapital.kyc.depot', u.id, { category }, clientIp(request));
  const officers = await db.select({ id: userRole.userId }).from(userRole).where(eq(userRole.role, 'conformite'));
  for (const o of officers) await notify(o.id, `Nouvelle vérification investisseur à traiter : ${u.name}`, '/admin/conformite');
  return json({ ok: true, message: `Pièces reçues. Catégorie proposée : investisseur ${category}. La conformité valide votre profil sous 48 heures.`, redirect: '/kapital/investisseur' });
};
