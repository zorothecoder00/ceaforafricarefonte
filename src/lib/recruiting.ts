/* Outils du recruteur (CDC §7.4) : qui peut gérer les candidatures d'une offre, réponses types par défaut, rendez-vous d'entretien. */
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { job, jobRecruiter } from '../db/schema/app';
import { mentoringVisio } from './agenda';

/** L'auteur de l'offre et les membres de son équipe de recrutement gèrent ses candidatures. */
export async function canRecruit(userId: string, jobId: string) {
  const [j] = await db.select({ owner: job.employerId }).from(job).where(eq(job.id, jobId));
  if (!j) return false;
  if (j.owner === userId) return true;
  return (await db.select({ u: jobRecruiter.userId }).from(jobRecruiter).where(and(eq(jobRecruiter.jobId, jobId), eq(jobRecruiter.userId, userId)))).length > 0;
}

/** Réponses types proposées tant que le recruteur n'a pas enregistré les siennes. Variables : {prenom}, {poste}, {entreprise}. */
export const DEFAULT_TEMPLATES: { name: string; body: string }[] = [
  { name: 'Accusé de réception', body: 'Bonjour {prenom},\n\nMerci pour votre candidature au poste de {poste} chez {entreprise}. Nous l’étudions et revenons vers vous sous 10 jours.\n\nCordialement' },
  { name: 'Invitation à un entretien', body: 'Bonjour {prenom},\n\nVotre profil a retenu notre attention pour le poste de {poste}. Nous vous proposons un entretien : vous trouverez la date et les modalités dans « Mes candidatures ».\n\nÀ bientôt' },
  { name: 'Réponse négative', body: 'Bonjour {prenom},\n\nMerci de l’intérêt porté au poste de {poste} chez {entreprise}. Après examen, nous ne donnons pas suite à votre candidature cette fois-ci. Nous vous souhaitons pleine réussite dans vos recherches.\n\nCordialement' },
  { name: 'Proposition d’embauche', body: 'Bonjour {prenom},\n\nNous avons le plaisir de vous proposer le poste de {poste} chez {entreprise}. Pouvons-nous échanger cette semaine sur les modalités ?\n\nBien cordialement' },
];

export const INTERVIEW_MODES: Record<string, string> = { visio: 'Visioconférence', presentiel: 'Présentiel', telephone: 'Téléphone' };

/** Lieu affiché au candidat : lien de visio créé automatiquement si aucun n'est donné. */
export const interviewPlace = (id: string, mode: string, place: string | null) => (place?.trim() ? place.trim() : mode === 'visio' ? mentoringVisio(id) : '');
