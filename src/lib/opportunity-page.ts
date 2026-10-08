/* Page d'opportunité composée par l'entreprise (CDC §8.8 « constructeur de page d'opportunité ») : vidéo de présentation,
   accroche, points forts, équipe, indicateurs de traction, utilisation des fonds (en %) et jalons.
   Enregistrée dans kapital.dossier.page ; visible de tout visiteur autorisé à voir la fiche de l'opportunité. */
import { z } from 'zod';

const t = (max: number) => z.string().trim().max(max);

export const OpportunityPage = z.object({
  tagline: t(160),
  video: t(500).refine((u) => !u || /^https:\/\/\S+$/.test(u), 'Vidéo : lien en https:// attendu (YouTube, Vimeo ou fichier .mp4)'),
  highlights: z.array(t(200).min(1)).max(6),
  team: z.array(z.object({ name: t(80).min(1, 'Nom du membre de l’équipe requis'), role: t(80), bio: t(300) })).max(8),
  kpis: z.array(z.object({ label: t(60).min(1, 'Libellé de l’indicateur requis'), value: t(40).min(1, 'Valeur de l’indicateur requise') })).max(8),
  funds: z.array(z.object({ label: t(80).min(1, 'Poste de dépense requis'), pct: z.number().int().min(1).max(100) })).max(8)
    .refine((f) => !f.length || f.reduce((a, x) => a + x.pct, 0) === 100, 'L’utilisation des fonds doit totaliser 100 %'),
  milestones: z.array(z.object({ when: t(40).min(1, 'Date du jalon requise'), label: t(160).min(1, 'Description du jalon requise') })).max(10),
});
export type OpportunityPage = z.infer<typeof OpportunityPage>;

export const emptyPage = (): OpportunityPage => ({ tagline: '', video: '', highlights: [], team: [], kpis: [], funds: [], milestones: [] });

/** Page enregistrée, ou null si l'entreprise n'a encore rien composé. */
export function readPage(v: unknown): OpportunityPage | null {
  const p = OpportunityPage.safeParse(v);
  if (!p.success) return null;
  const x = p.data;
  return x.tagline || x.video || x.highlights.length || x.team.length || x.kpis.length || x.funds.length || x.milestones.length ? x : null;
}
