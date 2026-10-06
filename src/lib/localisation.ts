/* Pays, langues, devises et fuseaux horaires (CDC §12 Paramétrage, §5.3 sélecteur pays/langue/devise, §5.4 devises) :
   réglables dans Paramétrage › Pays, langues, devises. Valeurs par défaut = celles du code (pays de présence, devises et
   taux indicatifs datés) ; les réglages enregistrés par l'équipe s'y superposent. */
import { getSetting } from './settings';
import { HUBS, country } from '../data/site';
import { CURRENCIES, COUNTRY_CURRENCY, RATES_DATE } from '../data/currency';

/** Fuseau horaire par défaut de chaque pays de présence. */
export const DEFAULT_TZ: Record<string, string> = {
  TG: 'Africa/Lome', CI: 'Africa/Abidjan', SN: 'Africa/Dakar', BJ: 'Africa/Porto-Novo', ML: 'Africa/Bamako', BF: 'Africa/Ouagadougou',
  CM: 'Africa/Douala', GA: 'Africa/Libreville', NG: 'Africa/Lagos', GH: 'Africa/Accra', KE: 'Africa/Nairobi', ZA: 'Africa/Johannesburg',
  MA: 'Africa/Casablanca', EG: 'Africa/Cairo', CD: 'Africa/Kinshasa', RW: 'Africa/Kigali', ET: 'Africa/Addis_Ababa',
};
const EN_COUNTRIES = new Set(['NG', 'GH', 'KE', 'ZA', 'RW', 'ET']);
/** Fuseaux proposés (Afrique et diaspora). */
export const TIMEZONES = [...new Set([...Object.values(DEFAULT_TZ), 'Africa/Conakry', 'Africa/Niamey', 'Africa/Kampala', 'Africa/Dar_es_Salaam', 'Africa/Tunis', 'Africa/Algiers', 'Europe/Paris', 'Europe/London', 'America/New_York', 'UTC'])].sort();
/** Langues de l'interface : le français et l'anglais sont traduits ; les autres arrivent avec les lots V2/V3 (CDC §5.4). */
export const LANGUAGES = [
  { code: 'fr', name: 'Français', ready: true }, { code: 'en', name: 'English', ready: true },
  { code: 'pt', name: 'Português', ready: false, phase: 'V2' }, { code: 'ar', name: 'العربية', ready: false, phase: 'V2' }, { code: 'sw', name: 'Kiswahili', ready: false, phase: 'V3' },
] as const;
/** Parité fixe du franc CFA avec l'euro : ces taux ne se modifient pas. */
export const FIXED_RATES: Record<string, number> = { XOF: 655.957, XAF: 655.957, EUR: 1 };

export type CountrySetting = { active: boolean; currency: string; tz: string; lang: 'fr' | 'en' };
export type Localisation = {
  countries: (CountrySetting & { code: string; name: string })[];
  currencies: { code: string; name: { fr: string; en: string }; symbol?: string; perEur: number; active: boolean }[];
  english: boolean; ratesDate: string; ratesSource: string;
};

export const defaultCountries = (): Record<string, CountrySetting> => Object.fromEntries(HUBS.map((h) => [h.c, { active: true, currency: COUNTRY_CURRENCY[h.c] ?? 'XOF', tz: DEFAULT_TZ[h.c] ?? 'Africa/Lome', lang: EN_COUNTRIES.has(h.c) ? 'en' : 'fr' }]));

export async function getLocalisation(): Promise<Localisation> {
  const s = await getSetting('localisation').catch(() => null);
  const base = defaultCountries();
  const countries = Object.entries(base).map(([code, d]) => ({ code, name: country(code), ...d, ...(s?.countries[code] ?? {}) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const currencies = CURRENCIES.map((c) => ({ ...c, perEur: FIXED_RATES[c.code] ?? s?.currencies[c.code]?.perEur ?? c.perEur, active: s?.currencies[c.code]?.active ?? true }));
  return { countries, currencies, english: s?.english ?? true, ratesDate: s?.ratesDate || RATES_DATE, ratesSource: s?.ratesSource || 'Taux indicatifs saisis par CEA' };
}

/** Fuseau d'un pays (profil d'un membre, lieu d'un événement) ; heure de Lomé par défaut. */
export async function timezoneOf(code: string | null | undefined) {
  if (!code) return 'Africa/Lome';
  return (await getLocalisation()).countries.find((c) => c.code === code)?.tz ?? DEFAULT_TZ[code] ?? 'Africa/Lome';
}
