/* Gardes d'API (CDC §18) : connexion, droit dans la matrice, double authentification des rôles sensibles.
   La base et l'authentification sont simulées : ces tests ne touchent à aucune donnée. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
vi.mock('../src/lib/auth', () => ({ auth: {} }));

const { staffApi } = await import('../src/lib/admin');
const { requireUser, requirePermission } = await import('../src/lib/session');

const user = (roles: string[], twoFactorEnabled = false) => ({ id: 'u1', name: 'Test', email: 't@cea.demo', roles, twoFactorEnabled });
const status = (r: unknown) => (r instanceof Response ? r.status : 200);

describe('requireUser', () => {
  it('refuse un visiteur (401)', () => expect(status(requireUser(null))).toBe(401));
  it('laisse passer un membre connecté', () => expect(status(requireUser(user(['membre'])))).toBe(200));
});

describe('requirePermission', () => {
  it('401 sans session, 403 sans droit, OK avec droit', () => {
    expect(status(requirePermission(undefined, 'dossier_kapital', 'C'))).toBe(401);
    expect(status(requirePermission(user(['membre']), 'dossier_kapital', 'C'))).toBe(403);
    expect(status(requirePermission(user(['entrepreneur']), 'dossier_kapital', 'C'))).toBe(200);
  });
});

describe('staffApi (back-office)', () => {
  it('refuse un membre même connecté', () => expect(status(staffApi(user(['membre', 'entrepreneur']), 'moderation', 'M'))).toBe(403));

  it('exige la double authentification pour un rôle sensible', async () => {
    const r = staffApi(user(['editeur'], false), 'moderation', 'M');
    expect(status(r)).toBe(403);
    expect(await (r as Response).json()).toMatchObject({ error: 'Double authentification requise.' });
  });

  it('autorise un éditeur avec double authentification', () => expect(status(staffApi(user(['editeur'], true), 'moderation', 'M'))).toBe(200));

  it("refuse à l'analyste les pièces KYC, même avec double authentification", () => expect(status(staffApi(user(['analyste'], true), 'pieces_kyc', 'L'))).toBe(403));

  it("refuse à l'administrateur la validation des décisions de comité", () => expect(status(staffApi(user(['admin'], true), 'decision_comite', 'V'))).toBe(403));
});
