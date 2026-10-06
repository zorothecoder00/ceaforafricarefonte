/* Paramétrage (CDC §12) : réglages modifiables sans développeur (back-office › Paramétrage), avec valeurs par défaut.
   Lecture mise en cache 60 secondes ; chaque modification est journalisée. */
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { setting } from '../db/schema/finance';

export const SETTINGS = {
  organisation: {
    label: 'Identité légale (factures et reçus)',
    schema: z.object({
      name: z.string().trim().min(2).max(120), legalForm: z.string().trim().max(120), address: z.string().trim().max(300),
      rccm: z.string().trim().max(60), taxId: z.string().trim().max(60), email: z.string().trim().max(160), phone: z.string().trim().max(40),
      footer: z.string().trim().max(500),
    }),
    defaults: { name: 'CEA FOR AFRICA', legalForm: 'Association', address: 'Lomé, Togo', rccm: '', taxId: '', email: 'contact@cea4africa.com', phone: '', footer: 'Merci de votre confiance.' },
  },
  fiscalite: {
    label: 'Fiscalité',
    schema: z.object({ rate: z.number().int().min(0).max(300), mention: z.string().trim().max(200), dueDays: z.number().int().min(0).max(120) }),
    // Taux en pour mille (180 = 18 %) ; 0 avec mention d'exonération tant que le statut fiscal n'est pas fixé
    defaults: { rate: 0, mention: 'TVA non applicable', dueDays: 30 },
  },
  comptabilite: {
    label: 'Comptes comptables (SYSCOHADA)',
    schema: z.object({
      journal: z.string().trim().min(1).max(10), client: z.string().regex(/^\d{3,10}$/), tva: z.string().regex(/^\d{3,10}$/),
      accounts: z.record(z.string(), z.string().regex(/^\d{3,10}$/)),
    }),
    defaults: {
      journal: 'VT', client: '411000', tva: '443100',
      accounts: { adhesion: '706100', billet: '706200', cours: '706300', programme: '706400', mastermind: '706500', expert: '706600', mise_en_avant: '706700', recherche: '706800', sponsoring: '758100', autre: '706000' },
    },
  },
  escalade: {
    label: 'Relances et escalades des tickets',
    schema: z.object({ remindHours: z.number().int().min(1).max(168), escalateHours: z.number().int().min(0).max(720), role: z.string().min(2).max(40), email: z.string().trim().max(160) }),
    // Relance du responsable N heures avant l'échéance ; escalade N heures après le dépassement, vers un rôle (et une adresse facultative)
    defaults: { remindHours: 24, escalateHours: 24, role: 'admin', email: '' },
  },
  moderation: {
    label: 'Filtres de modération',
    schema: z.object({ words: z.array(z.string().trim().min(2).max(80)).max(200), whatsapp: z.boolean(), reviewLinks: z.boolean() }),
    // Expressions qui retiennent une publication (« * » = quelques mots quelconques), numéro WhatsApp dans le texte, liens dans les avis de cours
    defaults: {
      words: ['western union', 'moneygram', 'frais de dossier', "payez d'abord", 'investissement garanti', 'rendement garanti', 'crypto*doubl'],
      whatsapp: true, reviewLinks: true,
    },
  },
  conservation: {
    label: 'Conservation des données',
    // Durées de la politique de confidentialité (CDC §15.1) ; appliquées chaque jour par /api/cron/rappels (src/lib/retention.ts)
    schema: z.object({
      enabled: z.boolean(),
      inactiveMonths: z.number().int().min(12).max(120), noticeDays: z.number().int().min(15).max(90),
      contactMonths: z.number().int().min(6).max(120), rejectedMonths: z.number().int().min(6).max(120),
      notificationsMonths: z.number().int().min(1).max(60), technicalDays: z.number().int().min(30).max(730),
      newsletterPendingDays: z.number().int().min(7).max(365), auditMonths: z.number().int().min(60).max(240),
    }),
    defaults: { enabled: true, inactiveMonths: 36, noticeDays: 30, contactMonths: 36, rejectedMonths: 24, notificationsMonths: 12, technicalDays: 90, newsletterPendingDays: 30, auditMonths: 60 },
  },
  localisation: {
    label: 'Pays, langues, devises et fuseaux',
    // Réglages superposés aux valeurs du code (src/lib/localisation.ts) : un pays ou une devise absents gardent leurs valeurs par défaut
    schema: z.object({
      countries: z.record(z.string().regex(/^[A-Z]{2}$/), z.object({ active: z.boolean(), currency: z.string().regex(/^[A-Z]{3}$/), tz: z.string().min(3).max(40), lang: z.enum(['fr', 'en']) })),
      currencies: z.record(z.string().regex(/^[A-Z]{3}$/), z.object({ active: z.boolean(), perEur: z.number().positive().max(1e6) })),
      english: z.boolean(),
      ratesDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
      ratesSource: z.string().trim().max(200),
    }),
    defaults: { countries: {}, currencies: {}, english: true, ratesDate: '', ratesSource: '' } as {
      countries: Record<string, { active: boolean; currency: string; tz: string; lang: 'fr' | 'en' }>;
      currencies: Record<string, { active: boolean; perEur: number }>;
      english: boolean; ratesDate: string; ratesSource: string;
    },
  },
  tutoriels: {
    label: "Tutoriels vidéo du centre d'aide",
    schema: z.object({ videos: z.record(z.string(), z.string()) }),
    // Article de la base de connaissances → lien de la vidéo (YouTube, Vimeo ou fichier https://)
    defaults: { videos: {} as Record<string, string> },
  },
  reseaux: {
    label: 'Réseaux sociaux (pied de page)',
    schema: z.object({ linkedin: z.string(), facebook: z.string(), x: z.string(), youtube: z.string(), instagram: z.string(), tiktok: z.string(), whatsapp: z.string() }),
    // Adresses https:// ; une icône n'apparaît dans le pied de page que si son adresse est renseignée
    defaults: { linkedin: '', facebook: '', x: '', youtube: '', instagram: '', tiktok: '', whatsapp: '' },
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

const cache = new Map<string, { at: number; v: unknown }>();
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v as SettingValue<K>;
  const [row] = await db.select().from(setting).where(eq(setting.key, key)).catch(() => []);
  const def = SETTINGS[key].defaults as SettingValue<K>;
  const parsed = row ? SETTINGS[key].schema.safeParse({ ...def, ...(row.value as object) }) : null;
  const v = (parsed?.success ? parsed.data : def) as SettingValue<K>;
  cache.set(key, { at: Date.now(), v });
  return v;
}
export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>, by: string) {
  await db.insert(setting).values({ key, value, updatedBy: by }).onConflictDoUpdate({ target: setting.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  cache.delete(key);
}
