// Lance une commande avec DB_TARGET défini, sans dépendre de la syntaxe du shell (Windows / Unix).
// Usage : node scripts/with-env.mjs prod drizzle-kit migrate
import { spawnSync } from 'node:child_process';
const [target, ...cmd] = process.argv.slice(2);
const r = spawnSync(cmd.join(' '), { stdio: 'inherit', shell: true, env: { ...process.env, DB_TARGET: target } });
process.exit(r.status ?? 1);
