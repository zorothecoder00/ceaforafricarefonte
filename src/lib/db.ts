/* Client PostgreSQL (Drizzle + node-postgres). Une seule instance réutilisée par processus.
   En production, DATABASE_URL pointe vers la connexion poolée de Neon. */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../db/schema';
import { requireEnv } from './env';

const g = globalThis as unknown as { __ceaPool?: pg.Pool };

function pool() {
  if (!g.__ceaPool) {
    const url = requireEnv('DATABASE_URL');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    g.__ceaPool = new pg.Pool({ connectionString: url, max: local ? 10 : 5, ssl: local ? undefined : { rejectUnauthorized: true } });
  }
  return g.__ceaPool;
}

export const db = drizzle(pool(), { schema });
export type DB = typeof db;
export { schema };
