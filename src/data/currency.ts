/* Devises d'affichage (CDC §5.4). Montants stockés en FCFA (XOF) et convertis à titre indicatif.
   Taux exprimés pour 1 EUR, datés ; le FCFA (XOF/XAF) a une parité fixe avec l'euro.
   À remplacer au lot 2 par un fournisseur de taux (avec source et horodatage réels). */
import type { L } from '../i18n/ui';

export const RATES_DATE = '2026-09-30';
export const CURRENCIES: { code: string; perEur: number; name: L; symbol?: string }[] = [
  { code: 'XOF', perEur: 655.957, name: { fr: 'Franc CFA (UEMOA)', en: 'CFA franc (WAEMU)' }, symbol: 'FCFA' },
  { code: 'XAF', perEur: 655.957, name: { fr: 'Franc CFA (CEMAC)', en: 'CFA franc (CEMAC)' }, symbol: 'FCFA (CEMAC)' },
  { code: 'NGN', perEur: 1690, name: { fr: 'Naira nigérian', en: 'Nigerian naira' } },
  { code: 'GHS', perEur: 13.4, name: { fr: 'Cedi ghanéen', en: 'Ghanaian cedi' } },
  { code: 'KES', perEur: 140, name: { fr: 'Shilling kényan', en: 'Kenyan shilling' } },
  { code: 'ZAR', perEur: 20.4, name: { fr: 'Rand sud-africain', en: 'South African rand' } },
  { code: 'MAD', perEur: 10.8, name: { fr: 'Dirham marocain', en: 'Moroccan dirham' } },
  { code: 'EGP', perEur: 52.5, name: { fr: 'Livre égyptienne', en: 'Egyptian pound' } },
  { code: 'USD', perEur: 1.09, name: { fr: 'Dollar américain', en: 'US dollar' } },
  { code: 'EUR', perEur: 1, name: { fr: 'Euro', en: 'Euro' } },
];

/** Devise par défaut selon le pays choisi. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  TG: 'XOF', CI: 'XOF', SN: 'XOF', BJ: 'XOF', ML: 'XOF', BF: 'XOF',
  CM: 'XAF', GA: 'XAF', NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', MA: 'MAD', EG: 'EGP',
  CD: 'USD', RW: 'USD', ET: 'USD',
};
