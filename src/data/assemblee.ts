/* Assemblée générale en cours (CDC §7.1, vie actionnariale). Le vote électronique n'est ouvert que si l'interrupteur
   réglementaire « vote » est activé pour le pays (validation juridique OHADA et statuts préalable, CDC §7.1 garde-fous). */
export const AG = {
  id: 'ago-2026-12',
  title: 'Assemblée générale ordinaire — 14 décembre 2026',
  date: '2026-12-14',
  closesAt: '2026-12-13T23:59:59Z', // clôture du vote électronique la veille de la séance
  resolutions: ['Approbation des comptes 2025', 'Affectation du résultat', "Renouvellement d'un administrateur"],
};
export const AG_CHOICES = ['Pour', 'Contre', 'Abstention'] as const;
