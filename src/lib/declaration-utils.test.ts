import { describe, it, expect } from 'vitest';
import {
  quarterRevenueRaw, quarterUncategorized, yearRevenueRaw,
  estimateCotisations, thresholdStatus, roundEuro, defaultSettings,
  officialRates, effectiveSettings, loadSettings, saveSettings,
} from './declaration-utils';
import { computeKpis, type Transaction, type Category } from './dashboard-utils';

const cats: Category[] = [
  { id: 'rev', name: 'Presta', emoji: null, color: null, type: 'revenue' },
  { id: 'exp', name: 'Frais', emoji: null, color: null, type: 'expense' },
];

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-02-10', label: 'x', amount: 0,
  category_id: 'rev', source: 'import', is_validated: true, ...p,
});

describe('quarterRevenueRaw', () => {
  it('somme uniquement les revenus du bon trimestre', () => {
    const txs = [
      tx({ date: '2026-02-10', amount: 1000 }),          // T1
      tx({ date: '2026-03-31', amount: 500 }),           // T1 (limite)
      tx({ date: '2026-04-01', amount: 999 }),           // T2
      tx({ date: '2026-02-15', amount: 300, category_id: null }), // non classé → exclu
      tx({ date: '2026-02-15', amount: 200, category_id: 'exp' }), // dépense-type → exclu
    ];
    expect(quarterRevenueRaw(txs, cats, 1)).toBe(1500);
    expect(quarterRevenueRaw(txs, cats, 2)).toBe(999);
  });
});

describe('quarterUncategorized', () => {
  it('compte les positifs sans catégorie du trimestre', () => {
    const txs = [
      tx({ date: '2026-02-15', amount: 300, category_id: null }),
      tx({ date: '2026-05-15', amount: 400, category_id: null }), // T2
      tx({ date: '2026-02-15', amount: -50, category_id: null }), // dépense → ignorée
    ];
    expect(quarterUncategorized(txs, 1)).toEqual({ count: 1, total: 300 });
  });
});

describe('estimateCotisations', () => {
  it('arrondit le CA à l\'euro puis applique les taux', () => {
    const s = { ...defaultSettings(), socialRate: 22, liberatoireEnabled: false };
    const e = estimateCotisations(1000.49, s);
    expect(e.caDeclared).toBe(1000);
    expect(e.social).toBe(220);
    expect(e.liberatoire).toBe(0);
    expect(e.total).toBe(220);
  });

  it('ajoute le versement libératoire quand activé', () => {
    const s = { ...defaultSettings(), socialRate: 22, liberatoireEnabled: true, liberatoireRate: 2.2 };
    const e = estimateCotisations(1000, s);
    expect(e.social).toBe(220);
    expect(e.liberatoire).toBe(22);
    expect(e.total).toBe(242);
  });
});

describe('thresholdStatus', () => {
  it('signale l\'approche puis le dépassement du plafond', () => {
    expect(thresholdStatus(40000, 77700).warn).toBe(false);
    expect(thresholdStatus(70000, 77700).warn).toBe(true);
    const over = thresholdStatus(80000, 77700);
    expect(over.over).toBe(true);
    expect(over.remaining).toBe(-2300);
  });
});

describe('yearRevenueRaw / roundEuro', () => {
  it('cumule le revenu annuel filtré', () => {
    const txs = [
      tx({ date: '2026-02-10', amount: 1000 }),
      tx({ date: '2026-08-10', amount: 2000 }),
      tx({ date: '2026-08-10', amount: 500, category_id: null }), // exclu
    ];
    expect(yearRevenueRaw(txs, cats)).toBe(3000);
    expect(roundEuro(3000.5)).toBe(3001);
  });
});

describe('même CA que le tableau de bord', () => {
  it('exclut une transaction catégorisée revenu mais pas validée, comme computeKpis', () => {
    const txs = [
      tx({ date: '2026-02-10', amount: 1000 }),
      tx({ date: '2026-02-11', amount: 400, is_validated: false }),
    ];
    expect(quarterRevenueRaw(txs, cats, 1)).toBe(1000);
    expect(yearRevenueRaw(txs, cats)).toBe(1000);
    expect(yearRevenueRaw(txs, cats)).toBe(computeKpis(txs, [], cats).revenue);
  });
});

describe('barème officiel par année', () => {
  it('BNC : 24,6 % / 77 700 € en 2025, 25,6 % / 83 600 € en 2026', () => {
    expect(officialRates('bnc', 2025)).toMatchObject({ socialRate: 24.6, plafond: 77700 });
    expect(officialRates('bnc', 2026)).toMatchObject({ socialRate: 25.6, plafond: 83600 });
  });

  it('une année absente reprend la dernière année connue', () => {
    expect(officialRates('bnc', 2027).socialRate).toBe(25.6);
    expect(officialRates('bnc', 2023).socialRate).toBe(24.6);
  });

  it('effectiveSettings suit l\'année affichée, sauf saisie manuelle', () => {
    const official = { ...defaultSettings(), useOfficialRates: true };
    expect(effectiveSettings(official, 2025).socialRate).toBe(24.6);
    expect(effectiveSettings(official, 2026).socialRate).toBe(25.6);
    const manual = { ...official, useOfficialRates: false, socialRate: 23 };
    expect(effectiveSettings(manual, 2026).socialRate).toBe(23);
  });
});

describe('loadSettings : réglages enregistrés avant le barème par année', () => {
  it('24,6 % / 77 700 € enregistrés tels quels → suivent désormais le barème', () => {
    saveSettings('u1', { regimeId: 'bnc', socialRate: 24.6, liberatoireEnabled: false, liberatoireRate: 2.2, plafond: 77700 } as never);
    const s = loadSettings('u1');
    expect(s.useOfficialRates).toBe(true);
    expect(effectiveSettings(s, 2026).socialRate).toBe(25.6);
  });

  it('un taux retouché à la main est gardé', () => {
    saveSettings('u2', { regimeId: 'bnc', socialRate: 12.3, liberatoireEnabled: false, liberatoireRate: 2.2, plafond: 77700 } as never);
    const s = loadSettings('u2');
    expect(s.useOfficialRates).toBe(false);
    expect(effectiveSettings(s, 2026).socialRate).toBe(12.3);
  });
});
