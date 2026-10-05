/* Campagnes et segments (CDC §12) : qui peut recevoir quoi, personnalisation, liens suivis sûrs. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: {} }));
const { eligible, summarize, Rules } = await import('../src/lib/segments');
const { personalize, linksOf, sendToken, validToken, emailHtml, variantOf } = await import('../src/lib/campaigns');

const base = { key: 'u:1', userId: '1', name: 'Awa Diallo', email: 'awa@ex.com', phone: '+22890000000', lang: 'fr', country: 'TG', marketing: false, relation: false, push: false };

describe('éligibilité', () => {
  it('le marketing exige le consentement', () => {
    expect(eligible(base, 'email', 'marketing')).toBe(false);
    expect(eligible({ ...base, marketing: true }, 'email', 'marketing')).toBe(true);
  });
  it('un message de service exige une relation (billet, inscription)', () => {
    expect(eligible({ ...base, marketing: true }, 'email', 'service')).toBe(false);
    expect(eligible({ ...base, relation: true }, 'email', 'service')).toBe(true);
  });
  it('il faut une adresse ou un appareil sur le canal choisi', () => {
    const r = { ...base, marketing: true, email: null, push: false };
    expect(eligible(r, 'email', 'marketing')).toBe(false);
    expect(eligible(r, 'sms', 'marketing')).toBe(true);
    expect(eligible(r, 'push', 'marketing')).toBe(false);
  });
  it('résumé par canal', () => {
    const s = summarize([{ ...base, marketing: true }, base]);
    expect(s.total).toBe(2);
    expect(s.marketing.email).toBe(1);
  });
  it('règles par défaut', () => {
    expect(Rules.parse({})).toMatchObject({ source: 'membres', countries: [], roles: [] });
    expect(Rules.safeParse({ countries: ['Togo'] }).success).toBe(false);
  });
});

describe('contenu', () => {
  it('personnalise prénom et nom, et reste correct sans nom', () => {
    expect(personalize('Bonjour {prenom}, cher {nom}', { name: 'Awa Diallo' })).toBe('Bonjour Awa, cher Awa Diallo');
    expect(personalize('Bonjour {prenom}, bienvenue', { name: '' })).toBe('Bonjour, bienvenue');
  });
  it('liste les liens dans l’ordre, sans doublon', () => {
    expect(linksOf('Voir https://a.com/x puis https://b.org et https://a.com/x.')).toEqual(['https://a.com/x', 'https://b.org']);
  });
  it('jeton de suivi signé', () => {
    const t = sendToken('11111111-1111-4111-8111-111111111111');
    expect(validToken('11111111-1111-4111-8111-111111111111', t)).toBe(true);
    expect(validToken('22222222-2222-4222-8222-222222222222', t)).toBe(false);
  });
  const camp = { id: 'c1', purpose: 'marketing', subject: 'S', body: 'Corps', subjectB: 'SB', bodyB: null, splitB: 20 } as never;
  const send = { id: '11111111-1111-4111-8111-111111111111', variant: 'A' } as never;
  it('e-mail : HTML échappé, liens remplacés par un numéro (pas de redirection ouverte), désabonnement', () => {
    const html = emailHtml(camp, send, 'Salut <script>x</script>\n\nLien : https://cea.africa/forum');
    expect(html).not.toContain('<script>');
    expect(html).toContain('/api/c/clic?s=11111111-1111-4111-8111-111111111111&amp;l=0&amp;t=');
    expect(html).not.toContain('u=https');
    expect(html).toContain('/desabonnement?s=');
    expect(html).toContain('/api/c/ouverture?s=');
  });
  it('variante B : objet B, et message A si le message B est vide', () => {
    expect(variantOf(camp, 'B')).toEqual({ subject: 'SB', body: 'Corps' });
    expect(variantOf(camp, 'A')).toEqual({ subject: 'S', body: 'Corps' });
  });
});

describe('liens en fin de phrase', () => {
  it('le point final ne fait pas partie du lien suivi', () => {
    const camp = { id: 'c1', purpose: 'service', subject: 'S', body: '', subjectB: null, bodyB: null, splitB: 0 } as never;
    const html = emailHtml(camp, { id: '11111111-1111-4111-8111-111111111111', variant: 'A' } as never, 'Inscrivez-vous : https://cea.africa/forum.');
    expect(html).toContain('>https://cea.africa/forum</a>.');
  });
});
