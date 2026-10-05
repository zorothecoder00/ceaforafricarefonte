/* Formulaires sans code, automatisations et gestion documentaire (CDC §12). */
import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { FormFields, visible, checkSubmission, route } = await import('../src/lib/forms');
const { matches, privateIp, safeTarget, sign } = await import('../src/lib/automations');
const { canRead, canWrite } = await import('../src/lib/documents');

const fields = FormFields.parse([
  { key: 'type', label: 'Vous êtes', kind: 'radio', options: ['Entreprise', 'Particulier'], required: true },
  { key: 'societe', label: 'Société', kind: 'text', required: true, showIf: { field: 'type', equals: 'Entreprise' } },
  { key: 'devis', label: 'Besoin d’un devis', kind: 'checkbox' },
  { key: 'budget', label: 'Budget', kind: 'number', required: true, showIf: { field: 'devis', equals: 'oui' } },
  { key: 'email', label: 'E-mail', kind: 'email', required: true },
]);

describe('formulaires conditionnels', () => {
  it('un champ s’affiche selon la réponse précédente', () => {
    expect(visible(fields, { type: 'Entreprise' }, fields[1])).toBe(true);
    expect(visible(fields, { type: 'Particulier' }, fields[1])).toBe(false);
    expect(visible(fields, { devis: 'on' }, fields[3])).toBe(true);
    expect(visible(fields, {}, fields[3])).toBe(false);
  });
  it('un champ masqué n’est ni exigé ni conservé', () => {
    const r = checkSubmission(fields, { type: 'Particulier', societe: 'Ignorée SA', email: 'a@b.co' });
    expect(r).toEqual({ ok: true, data: { type: 'Particulier', devis: 'non', email: 'a@b.co' } });
  });
  it('un champ affiché et requis est exigé ; formats contrôlés', () => {
    expect(checkSubmission(fields, { type: 'Entreprise', email: 'a@b.co' }).ok).toBe(false);
    expect(checkSubmission(fields, { type: 'Particulier', devis: true, budget: 'beaucoup', email: 'a@b.co' }).ok).toBe(false);
    expect(checkSubmission(fields, { type: 'Autre', email: 'a@b.co' }).ok).toBe(false);
    expect(checkSubmission(fields, { type: 'Particulier', email: 'pas-un-mail' }).ok).toBe(false);
  });
  it('refuse une condition sur un champ placé plus bas (pas de cycle)', () => {
    expect(FormFields.safeParse([{ key: 'a', label: 'Aaa', kind: 'text', showIf: { field: 'b', equals: 'x' } }, { key: 'b', label: 'Bbb', kind: 'text' }]).success).toBe(false);
  });
  it('routage : première règle vérifiée, sinon équipe par défaut', () => {
    const rules = [{ field: 'type', equals: 'Entreprise', team: 'Partenariats', priority: 'haute' as const }];
    expect(route(rules, { type: 'Entreprise' }, 'Accueil')).toEqual({ team: 'Partenariats', priority: 'haute' });
    expect(route(rules, { type: 'Particulier' }, 'Accueil')).toEqual({ team: 'Accueil', priority: 'normale' });
  });
});

describe('automatisations', () => {
  const p = { reference: 'FRM-1', equipe: 'Finance', montant: 50000, reponse: { secteur: 'Agro' } };
  it('conditions sur les données de l’événement, champs imbriqués compris', () => {
    expect(matches([{ field: 'equipe', op: 'egal', value: 'finance' }], p)).toBe(true);
    expect(matches([{ field: 'reponse.secteur', op: 'contient', value: 'agr' }], p)).toBe(true);
    expect(matches([{ field: 'montant', op: 'superieur', value: '100000' }], p)).toBe(false);
    expect(matches([{ field: 'pays', op: 'existe', value: '' }], p)).toBe(false);
    expect(matches([], p)).toBe(true);
  });
  it('webhooks : adresses internes refusées', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) expect(privateIp(ip)).toBe(true);
    expect(privateIp('8.8.8.8')).toBe(false);
    expect(await safeTarget('http://example.com')).toBe('HTTPS obligatoire');
    expect(await safeTarget('https://localhost/x')).toBe('Adresse interne refusée');
    expect(await safeTarget('https://127.0.0.1/x')).toBe('Adresse interne refusée');
  });
  it('signature HMAC-SHA256 du corps', () => {
    expect(sign('s3cret', '{"a":1}')).toBe(`sha256=${createHmac('sha256', 's3cret').update('{"a":1}').digest('hex')}`);
  });
});

describe('droits par dossier', () => {
  const f = { readers: ['analyste'], writers: ['charge_programme'] };
  it('lecteurs, rédacteurs, administrateur', () => {
    expect(canRead(f, ['analyste'])).toBe(true);
    expect(canWrite(f, ['analyste'])).toBe(false);
    expect(canRead(f, ['charge_programme'])).toBe(true); // déposer implique consulter
    expect(canRead(f, ['editeur'])).toBe(false);
    expect(canWrite(f, ['admin'])).toBe(true);
  });
});
