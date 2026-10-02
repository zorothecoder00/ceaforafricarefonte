/* Tests de bout en bout des droits (CDC §18) contre un serveur lancé avec la base de démonstration locale.
   Lancement : `npm run dev` puis `TEST_BASE_URL=http://localhost:4321 npm test`.
   Comptes de scripts/seed.ts (jamais présents en production). Sans TEST_BASE_URL, ces tests sont ignorés. */
import { beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env.TEST_BASE_URL;
const PASSWORD = 'Demo-CEA-2026!';
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

const signIn = (email: string) => fetch(`${BASE}/api/auth/sign-in/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE! }, body: JSON.stringify({ email, password: PASSWORD }) });
async function login(email: string) {
  const r = await signIn(email);
  expect(r.status, `connexion ${email}`).toBe(200);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const get = (path: string, cookie = '') => fetch(BASE + path, { headers: { cookie }, redirect: 'manual' });
const post = (path: string, body: unknown, cookie = '') => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE!, cookie }, body: JSON.stringify(body) });

describe.skipIf(!BASE)('Droits de bout en bout', () => {
  let membre = '';
  beforeAll(async () => { membre = await login('aicha@cea.demo'); });

  describe('visiteur', () => {
    it.each(['/espace', '/espace/profil', '/admin', '/admin/audit'])('%s redirige vers la connexion', async (p) => {
      const r = await get(p);
      expect(r.status).toBe(302);
      expect(r.headers.get('location')).toMatch(/^\/connexion\?retour=/);
    });
    it.each([
      ['/api/admin', { action: 'report.status', id: FAKE_ID, status: 'clos' }],
      ['/api/projets', {}],
      ['/api/evenements', { action: 'agenda', eventId: 'e1', session: '1-09:00' }],
    ])('POST %s est refusé (401)', async (p, body) => expect((await post(p, body)).status).toBe(401));
    it('les exports CSV sont refusés', async () => expect((await get('/api/admin/export?type=audit')).status).toBe(401));
  });

  describe('membre', () => {
    it('accède à son espace', async () => expect((await get('/espace', membre)).status).toBe(200));
    it('ne voit pas le back-office (403)', async () => expect((await get('/admin', membre)).status).toBe(403));
    it.each([
      { action: 'report.status', id: FAKE_ID, status: 'clos' },
      { action: 'kyc.review', id: FAKE_ID, status: 'verifie' },
      { action: 'role.grant', userId: 'x', role: 'admin' },
      { action: 'flag.set', country: 'TG', feature: 'kap_sub', enabled: true },
    ])('ne peut pas exécuter $action', async (body) => expect((await post('/api/admin', body, membre)).status).toBe(403));
    it.each(['audit', 'paiements', 'membres', 'newsletter'])('ne peut pas exporter %s', async (t) => expect((await get(`/api/admin/export?type=${t}`, membre)).status).toBe(403));
    it("ne peut pas ouvrir la fiche projet d'un autre membre", async () => {
      const r = await get(`/espace/projets/${FAKE_ID}`, membre);
      expect([403, 404]).toContain(r.status);
    });
  });
  describe('rôles sensibles (double authentification active dans la base de démo)', () => {
    // Le cas « rôle sensible sans double authentification » est couvert par tests/guards.test.ts.
    it.each(['admin@cea.demo', 'analyste@cea.demo'])('la connexion de %s s’arrête au second facteur, sans session', async (email) => {
      const r = await signIn(email);
      const d = await r.json();
      expect(d.twoFactorRedirect).toBe(true);
      const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      expect((await get('/admin', cookie)).status).toBe(302);
      expect((await post('/api/admin', { action: 'report.status', id: FAKE_ID, status: 'clos' }, cookie)).status).toBe(401);
    });
  });
});
