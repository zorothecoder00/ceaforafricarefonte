/* Modèle financier guidé (CDC §7.2) — module pur, utilisable côté serveur et dans le navigateur. */
export type FinanceInputs = { ca: number; croissance: number; marge: number; chargesMensuelles: number; investissement: number; tresorerieInitiale: number; bfrJours: number };
export const DEFAULT_FINANCE: FinanceInputs = { ca: 50_000_000, croissance: 40, marge: 45, chargesMensuelles: 1_500_000, investissement: 20_000_000, tresorerieInitiale: 5_000_000, bfrJours: 45 };

export function financeModel(i: FinanceInputs) {
  const years = [1, 2, 3, 4, 5].map((y) => {
    const ca = i.ca * Math.pow(1 + i.croissance / 100, y - 1);
    const margeBrute = (ca * i.marge) / 100;
    const charges = i.chargesMensuelles * 12 * Math.pow(1.08, y - 1); // charges fixes +8 %/an
    const ebe = margeBrute - charges;
    const bfr = (ca * i.bfrJours) / 365;
    return { y, ca, margeBrute, charges, ebe, bfr };
  });
  let cash = i.tresorerieInitiale - i.investissement, prevBfr = 0, lowest = cash;
  const cashflow = years.map((r) => {
    cash += r.ebe - (r.bfr - prevBfr);
    prevBfr = r.bfr;
    lowest = Math.min(lowest, cash);
    return cash;
  });
  const besoin = lowest < 0 ? Math.ceil((-lowest * 1.15) / 1_000_000) * 1_000_000 : 0; // +15 % de marge de sécurité
  const alertes: string[] = [];
  if (i.marge > 85) alertes.push('Marge brute supérieure à 85 % : rarement observée hors logiciel, vérifiez vos coûts directs.');
  if (i.croissance > 200) alertes.push('Croissance annuelle supérieure à 200 % sur 5 ans : hypothèse très optimiste pour un investisseur.');
  if (cashflow.some((c) => c < 0)) alertes.push(`Trésorerie négative en année ${cashflow.findIndex((c) => c < 0) + 1} : un financement d’environ ${besoin.toLocaleString('fr-FR')} FCFA est nécessaire.`);
  if (years[0].ebe < 0 && years[4].ebe < 0) alertes.push('Résultat d’exploitation négatif sur les 5 ans : le modèle économique n’atteint pas l’équilibre.');
  if (i.bfrJours > 120) alertes.push('Délai de BFR supérieur à 120 jours : vérifiez les délais de paiement clients et fournisseurs.');
  return { years, cashflow, besoin, alertes };
}
