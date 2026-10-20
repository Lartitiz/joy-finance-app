import { describe, it, expect } from 'vitest';
import {
  tvaPart, splitRevenue, computeProvisions, urssafDueDate, upcomingDeadlineQuarter, urssafDeadline,
} from './provision-utils';
import { defaultSettings, effectiveSettings, estimateCotisations } from './declaration-utils';
import type { Transaction, Category } from './dashboard-utils';

const cats: Category[] = [
  { id: 'rev', name: 'Presta', emoji: null, color: null, type: 'revenue' },
  { id: 'exp', name: 'Frais', emoji: null, color: null, type: 'expense' },
  { id: 'rem', name: 'Rémunération', emoji: null, color: null, type: 'remuneration' },
];

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-02-10', label: 'x', amount: 0,
  category_id: 'rev', source: 'import', is_validated: true, ...p,
});

const s2026 = effectiveSettings(defaultSettings(), 2026); // 25,6 % + 0,2 % CFP

describe('tvaPart', () => {
  it('rien en franchise ou avant la date', () => {
    expect(tvaPart(1200, '2026-12-31', s2026)).toBe(0);
    expect(tvaPart(1200, '2026-12-31', { ...s2026, tvaStartDate: '2027-01-01' })).toBe(0);
  });
  it('20/120 du TTC à partir de la date', () => {
    expect(tvaPart(1200, '2027-01-01', { ...s2026, tvaStartDate: '2027-01-01' })).toBeCloseTo(200);
  });
});

describe('computeProvisions', () => {
  it('franchise : 25,8 % des encaissements, dépenses hors rémunération', () => {
    const txs = [
      tx({ amount: 10000 }),
      tx({ amount: -1000, category_id: 'exp' }),
      tx({ amount: -3000, category_id: 'rem' }), // rémunération : pas une dépense
    ];
    const p = computeProvisions(txs, cats, s2026);
    expect(p.encaissements).toBe(10000);
    expect(p.tva).toBe(0);
    expect(p.cotisations).toBe(2580);
    expect(p.total).toBe(2580);
    expect(p.depenses).toBe(1000);
    expect(p.aMoi).toBe(10000 - 2580 - 1000);
  });

  it('les prélèvements URSSAF ne sont pas comptés deux fois (provision + dépense)', () => {
    const txs = [
      tx({ date: '2026-08-10', amount: 10657.01 }),
      tx({ date: '2026-08-04', amount: -2863, label: 'PRLV SEPA URSSAF BOURGOGNE', category_id: 'exp' }),
      tx({ date: '2026-08-20', amount: -5195.21, category_id: 'exp' }),
    ];
    const p = computeProvisions(txs, cats, s2026);
    expect(p.urssafPaid).toBe(2863);
    expect(p.depenses).toBeCloseTo(5195.21);
    expect(p.total).toBe(2749);
    expect(p.aMoi).toBeCloseTo(10657.01 - 2749 - 5195.21);
  });

  it('assujettie : TVA collectée à part, cotisations sur le HT', () => {
    const s = { ...s2026, tvaStartDate: '2027-01-01' };
    const p = computeProvisions([tx({ date: '2027-02-01', amount: 12000 })], cats, s);
    expect(p.tva).toBeCloseTo(2000);
    expect(p.cotisations).toBe(2580); // 25,8 % de 10 000 HT
    expect(p.total).toBeCloseTo(4580);
    expect(p.aMoi).toBeCloseTo(12000 - 4580);
  });

  it('l\'année vaut exactement la somme de ses trimestres (même arrondi que la Déclaration)', () => {
    const txs = [tx({ date: '2026-02-10', amount: 1234.56 }), tx({ date: '2026-05-10', amount: 987.65 })];
    const year = computeProvisions(txs, cats, s2026).cotisations;
    const q1 = estimateCotisations(1234.56, s2026).total;
    const q2 = estimateCotisations(987.65, s2026).total;
    expect(year).toBe(q1 + q2);
  });

  it('splitRevenue ignore les rentrées non classées', () => {
    expect(splitRevenue([tx({ amount: 500, category_id: null })], cats, s2026).ttc).toBe(0);
  });
});

describe('échéances URSSAF', () => {
  it('dernier jour du mois suivant le trimestre', () => {
    expect(urssafDueDate(2026, 1)).toBe('2026-04-30');
    expect(urssafDueDate(2026, 2)).toBe('2026-07-31');
    expect(urssafDueDate(2026, 3)).toBe('2026-10-31');
    expect(urssafDueDate(2026, 4)).toBe('2027-01-31');
  });

  it('prochaine échéance de l\'année à partir d\'aujourd\'hui', () => {
    expect(upcomingDeadlineQuarter(2026, '2026-10-20')).toBe(3);
    expect(upcomingDeadlineQuarter(2026, '2026-11-01')).toBe(4);
    expect(upcomingDeadlineQuarter(2025, '2026-10-20')).toBe(4);
  });

  it('montant estimé = cotisations du trimestre', () => {
    const txs = [tx({ date: '2026-08-10', amount: 10000 }), tx({ date: '2026-02-10', amount: 5000 })];
    const d = urssafDeadline(txs, cats, s2026, 2026, 3, '2026-10-20');
    expect(d).toEqual({ year: 2026, quarter: 3, dueDate: '2026-10-31', amount: 2580, passed: false });
  });
});
