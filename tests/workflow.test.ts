/* Moteur de workflow CEA OS (noyau sans base) : seuils, circuits conditionnels, acheminement automatique, séparation des
   fonctions, délais, pièces critiques, ordre des phases, format texte du paramétrage. */
import { describe, expect, it } from 'vitest';
import {
  buildSteps, thresholdsFor, missingCritical, nextPhase, eligible, slaAction, parseStepsText, stepsToText, parseChecklistText, parseExecText, circuitLabel,
  type Ctx, type ThresholdRow, type Thresholds,
} from '../src/lib/os/workflow-core';
import { DEFAULT_CIRCUITS, DEFAULT_TYPES } from '../src/lib/os/workflow-defaults';

const REG: Record<string, string> = { TG: 'AO', CI: 'AO', SN: 'AO', CM: 'AC', KE: 'AE' };
const regionOf = (c: string) => REG[c] ?? null;
const thr: Thresholds = { pays: 500_000, reg: 5_000_000, dg: 50_000_000, contrat: 10_000_000 };
const C = (code: string) => DEFAULT_CIRCUITS.find((c) => c.code === code)!;
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ amount: 0, country: 'TG', regionOf, ...o });
const roles = (code: string, o: Partial<Ctx> = {}, t = thr) => buildSteps(C(code), ctx(o), t).map((s) => s.l);

describe('seuils (WFL-04)', () => {
  const rows: ThresholdRow[] = [
    { type: '*', scope: 'all', key: 'pays', amount: 700_000 },
    { type: '*', scope: 'r:AO', key: 'pays', amount: 800_000 },
    { type: 'dep', scope: 'all', key: 'pays', amount: 900_000 },
    { type: 'dep', scope: 'p:TG', key: 'pays', amount: 1_000_000 },
  ];
  it('le plus précis l’emporte : type puis tous types ; pays, région, organisation', () => {
    expect(thresholdsFor('dep', 'TG', 'AO', rows, thr).pays).toBe(1_000_000);
    expect(thresholdsFor('dep', 'CI', 'AO', rows, thr).pays).toBe(900_000);
    expect(thresholdsFor('achat', 'CI', 'AO', rows, thr).pays).toBe(800_000);
    expect(thresholdsFor('achat', 'CM', 'AC', rows, thr).pays).toBe(700_000);
  });
  it('sans ligne, la valeur générale', () => expect(thresholdsFor('dep', 'TG', 'AO', [], thr)).toEqual(thr));
});

describe('circuits conditionnels (annexe A)', () => {
  it('dépense : pays seul sous le seuil pays, puis région, puis Direction générale ; finance toujours', () => {
    expect(roles('V04', { amount: 100_000 })).toEqual(['pays', 'fin']);
    expect(roles('V04', { amount: 1_000_000 })).toEqual(['pays', 'reg', 'fin']);
    expect(roles('V04', { amount: 9_000_000 })).toEqual(['pays', 'reg', 'dg', 'fin']);
  });
  it('les mêmes règles qu’avant le moteur pour les demandes existantes', () => {
    expect(roles('V04-NDF', { amount: 9e9 })).toEqual(['manager', 'fin']);
    expect(roles('V04-ACH', { amount: 6_000_000 })).toEqual(['manager', 'dg', 'fin']);
    expect(roles('V01-CONGE')).toEqual(['manager', 'rh']);
    expect(roles('V05', { amount: 20_000_000 })).toEqual(['jur', 'dg']);
    expect(roles('V06', { lvl: 'agent' })).toEqual(['reg', 'rh']);
    expect(roles('V06', { lvl: 'cadre' })).toEqual(['dg', 'rh']);
  });
  it('document : Direction générale seulement si confidentiel ou stratégique', () => {
    expect(roles('V02')).toEqual(['manager']);
    expect(roles('V02', { conf: 'Confidentiel' })).toEqual(['manager', 'dg']);
  });
  it('un seuil propre au pays change le circuit', () => {
    expect(roles('V04', { amount: 1_000_000 }, { ...thr, pays: 2_000_000 })).toEqual(['pays', 'fin']);
  });
});

describe('acheminement automatique (WFL-14)', () => {
  it('plusieurs pays : niveau régional ajouté avant le contrôle finance', () => {
    expect(roles('V04', { amount: 100_000, countries: ['CI'] })).toEqual(['pays', 'reg', 'fin']);
  });
  it('plusieurs régions : Direction générale', () => {
    expect(roles('V07', { countries: ['KE'] })).toEqual(['chef', 'pays', 'reg', 'dg']);
  });
  it('sujet stratégique : circuit renforcé (Direction générale puis Bureau panafricain)', () => {
    expect(roles('V01', { strategic: true })).toEqual(['manager', 'dg', 'bp']);
  });
  it('jamais deux fois de suite le même niveau', () => {
    const r = roles('V08', { countries: ['KE'], strategic: true });
    expect(r.some((x, i) => i > 0 && x === r[i - 1])).toBe(false);
    expect(r).toContain('bp');
  });
  it('libellé lisible', () => expect(circuitLabel([{ l: 'pays' }, { l: 'fin' }])).toBe('Représentant pays → Finance'));
});

describe('règles du moteur', () => {
  it('pièce critique manquante : soumission refusée (WFL-05)', () => {
    const t = DEFAULT_TYPES.find((x) => x.code === 'projet_pays')!;
    expect(missingCritical(t.checklist, {}).map((x) => x.k)).toEqual(['note', 'budget']);
    expect(missingCritical(t.checklist, { note: 'f1', budget: 'f2' })).toEqual([]);
  });
  it('phases dans l’ordre, sans contournement (WFL-01)', () => {
    const t = DEFAULT_TYPES.find((x) => x.code === 'projet_pays')!;
    expect(nextPhase(t, 'entree')).toBe('qualification');
    expect(nextPhase(t, 'cloture')).toBe('capitalisation');
    expect(nextPhase(t, 'capitalisation')).toBeNull();
    expect(nextPhase(t, 'affectation')).toBeNull(); // phase absente de ce type
  });
  it('séparation des fonctions : ni le demandeur ni un précédent approbateur (WFL-11)', () => {
    expect(eligible(['A', 'B', 'C', 'B'], 'A', ['C'])).toEqual(['B']);
    expect(eligible(['A'], 'A', [])).toEqual([]);
  });
  it('délais : rappel, escalade au responsable, puis niveau supérieur ; suspension (WFL-08)', () => {
    const due = new Date('2026-10-01T08:00:00Z');
    const h = (n: number) => new Date(due.getTime() + n * 36e5);
    expect(slaAction(due, h(-1), 0, false)).toBe('rien');
    expect(slaAction(due, h(1), 0, false)).toBe('rappel');
    expect(slaAction(due, h(10), 1, false)).toBe('rien');
    expect(slaAction(due, h(25), 1, false)).toBe('escalade1');
    expect(slaAction(due, h(49), 2, false)).toBe('escalade2');
    expect(slaAction(due, h(80), 3, false)).toBe('rien');
    expect(slaAction(due, h(5), 0, true)).toBe('suspendre');
  });
});

describe('paramétrage au format texte (WFL-03)', () => {
  it('aller-retour des étapes', () => {
    for (const c of DEFAULT_CIRCUITS) expect(parseStepsText(stepsToText(c.steps))).toEqual(c.steps);
  });
  it('erreurs lisibles', () => {
    expect(parseStepsText('patron | | 48')).toMatch(/approbateur « patron » inconnu/);
    expect(parseStepsText('fin | montant>10 | 48')).toMatch(/condition/);
    expect(parseChecklistText('Note | Note')).toMatch(/clé/);
    expect(parseExecText('Tâche | demain')).toMatch(/jours/);
  });
  it('chaque type par défaut pointe vers un circuit existant', () => {
    for (const t of DEFAULT_TYPES) expect(DEFAULT_CIRCUITS.some((c) => c.code === t.circuit)).toBe(true);
    expect(new Set(DEFAULT_CIRCUITS.map((c) => c.family)).size).toBe(16);
  });
});
