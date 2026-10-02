/* Migrations Drizzle.
   - Local  : npm run db:migrate       (lit .env)
   - Neon   : npm run db:migrate:prod  (lit .env.prod.bak, connexion directe non poolée)
   Seuls les schémas « public » et « kapital » sont gérés : le schéma « neon_auth » de Neon n'est jamais touché. */
import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

const prod = process.env.DB_TARGET === 'prod';
config({ path: prod ? '.env.prod.bak' : '.env', override: true, quiet: true });

const url = (prod && process.env.DATABASE_URL_UNPOOLED) || process.env.DATABASE_URL;
if (!url) throw new Error(`DATABASE_URL manquante dans ${prod ? '.env.prod.bak' : '.env'}`);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  schemaFilter: ['public', 'kapital'],
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  strict: true,
  verbose: true,
});
