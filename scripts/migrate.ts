/* Applique les migrations du dossier drizzle/ (même résultat que drizzle-kit migrate, avec des erreurs lisibles).
   Usage : npm run db:migrate            → base locale (.env)
           npm run db:migrate:prod       → Neon (.env.prod.bak, connexion directe) */
import { config } from 'dotenv';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const prod = process.env.DB_TARGET === 'prod';
config({ path: prod ? '.env.prod.bak' : '.env', override: true, quiet: true });
const url = (prod && process.env.DATABASE_URL_UNPOOLED) || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquante');

const host = new URL(url).host;
const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
console.log(`→ Migrations sur ${prod ? 'PRODUCTION (Neon)' : 'base locale'} : ${host}`);

const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: true } });
await client.connect();
try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle', migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' });
  const { rows } = await client.query(`select table_schema, count(*)::int n from information_schema.tables where table_schema in ('public','kapital') group by 1 order by 1`);
  console.log('✓ Migrations appliquées.', rows.map((r) => `${r.table_schema}: ${r.n} tables`).join(', '));
} catch (e) {
  console.error('✗ Échec :', e instanceof Error ? e.message : e, (e as { cause?: unknown })?.cause ?? '');
  process.exitCode = 1;
} finally {
  await client.end();
}
