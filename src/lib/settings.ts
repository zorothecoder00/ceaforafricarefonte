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
