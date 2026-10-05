/* Donner un rôle d'équipe (admin par défaut) à un compte existant : sert à créer le PREMIER administrateur d'une base.
   Les suivants se nomment depuis le back-office (/admin/membres).
     npm run admin:ajouter -- prenom.nom@exemple.com                 → base locale (.env), rôle admin
     npm run admin:ajouter -- prenom.nom@exemple.com editeur         → autre rôle d'équipe
     npm run admin:ajouter:prod -- prenom.nom@exemple.com            → PRODUCTION (Neon, .env.prod.bak)
   Le compte doit déjà exister : créez-le d'abord sur le site (/connexion?mode=inscription), le mot de passe reste géré par le site.
   Chaque nomination est inscrite au journal d'audit. */
import { config } from 'dotenv';
import pg from 'pg';

const prod = process.env.DB_TARGET === 'prod';
config({ path: prod ? '.env.prod.bak' : '.env', override: true, quiet: true });
const url = (prod && process.env.DATABASE_URL_UNPOOLED) || process.env.DATABASE_URL;
const [email, role = 'admin'] = process.argv.slice(2).filter((a) => a !== '--');
const STAFF = ['admin', 'direction', 'editeur', 'charge_programme', 'analyste', 'comite', 'conformite', 'responsable_pays'];

if (!url) throw new Error('Connexion à la base introuvable.');
if (!email || !/^\S+@\S+\.\S+$/.test(email)) { console.error('Usage : npm run admin:ajouter[:prod] -- e-mail [rôle]'); process.exit(1); }
if (!STAFF.includes(role)) { console.error(`Rôle inconnu. Rôles d'équipe : ${STAFF.join(', ')}`); process.exit(1); }

const c = new pg.Client({ connectionString: url });
await c.connect();
const [u] = (await c.query(`select id, name, two_factor_enabled from "user" where lower(email) = lower($1)`, [email])).rows;
if (!u) {
  console.error(`Aucun compte « ${email} » sur la base ${prod ? 'de PRODUCTION' : 'locale'}. Créez-le d'abord sur le site (/connexion?mode=inscription).`);
  await c.end(); process.exit(1);
}
const added = (await c.query(`insert into user_role (user_id, role) values ($1, $2) on conflict do nothing`, [u.id, role])).rowCount;
await c.query(`insert into audit_log (actor_id, action, target, meta) values (null, 'role.ajout.console', $1, $2)`, [u.id, JSON.stringify({ role, email, via: 'scripts/admin.ts' })]);
const roles = (await c.query(`select string_agg(role::text, ', ' order by role) r from user_role where user_id = $1`, [u.id])).rows[0].r;
await c.end();

console.log(`${prod ? 'PRODUCTION' : 'Local'} · ${u.name} <${email}> · ${added ? `rôle « ${role} » ajouté` : `avait déjà le rôle « ${role} »`} · rôles : ${roles}`);
if (!u.two_factor_enabled) console.log('Étape suivante : se déconnecter, se reconnecter, activer la double authentification sur /espace/securite, puis ouvrir /admin.');
