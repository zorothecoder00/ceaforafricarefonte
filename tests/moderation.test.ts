import { describe, it, expect, vi, beforeEach } from 'vitest';

// Filtres de modération : la liste vient du paramétrage (ici simulé)
let filters = { words: ['western union', "payez d'abord", 'crypto*doubl'], whatsapp: true, reviewLinks: true };
vi.mock('../src/lib/settings', () => ({ getSetting: async () => filters }));
const { suspectReason, reviewHeld } = await import('../src/lib/moderation');

describe('filtres de modération', () => {
  beforeEach(() => { filters = { words: ['western union', "payez d'abord", 'crypto*doubl'], whatsapp: true, reviewLinks: true }; });

  it('retient une publication contenant une expression, sans tenir compte des majuscules ni des accents', async () => {
    expect(await suspectReason('Envoyez par WESTERN Union svp')).toBe('western union');
    expect(await suspectReason('Payéz d’abord les frais')).toBe("payez d'abord");
  });
  it('« * » remplace quelques mots quelconques', async () => {
    expect(await suspectReason('Crypto : je double votre mise en 7 jours')).toBe('crypto*doubl');
    expect(await suspectReason('Formation crypto pour débutants')).toBeNull();
  });
  it('les caractères spéciaux saisis par l’équipe sont pris au pied de la lettre', async () => {
    filters.words = ['100% garanti (sûr)'];
    expect(await suspectReason('Rendement 100% garanti (sûr) !')).toBe('100% garanti (sûr)');
    expect(await suspectReason('100 garanti sur')).toBeNull();
  });
  it('numéro WhatsApp : retenu seulement si la règle est active', async () => {
    expect(await suspectReason('Écrivez-moi sur WhatsApp +228 90 00 00 00')).toBe('numéro WhatsApp');
    filters.whatsapp = false;
    expect(await suspectReason('Écrivez-moi sur WhatsApp +228 90 00 00 00')).toBeNull();
  });
  it('laisse passer une publication ordinaire', async () => {
    expect(await suspectReason('Atelier export ZLECAf à Lomé jeudi, inscrivez-vous !')).toBeNull();
  });
  it('avis de cours : un lien est retenu tant que la règle est active', async () => {
    expect(await reviewHeld('Super cours, voir www.exemple.com')).toBe(true);
    expect(await reviewHeld('Super cours')).toBe(false);
    expect(await reviewHeld(null)).toBe(false);
    filters.reviewLinks = false;
    expect(await reviewHeld('Super cours, voir https://exemple.com')).toBe(false);
  });
});
