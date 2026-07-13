import { describe, it, expect } from 'vitest';
import {
  computeKpis,
  computeUncategorizedIncome,
  computeQuarterlyBreakdown,
  type Transaction,
  type Category,
} from './dashboard-utils';

const cats: Category[] = [
  { id: 'rev', name: 'Prestations', emoji: '💰', color: null, type: 'revenue' },
  { id: 'exp', name: 'Logiciels', emoji: '🧾', color: null, type: 'expense' },
];

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36),
    date: '2026-01-15',
    label: 'x',
    amount: 0,
    category_id: null,
    source: 'import',
    is_validated: false,
    ...partial,
  };
}

describe('computeUncategorizedIncome', () => {
  it('compte les rentrées positives SANS catégorie', () => {
    const txs = [
      tx({ amount: 100, category_id: 'rev' }), // classée → ignorée
      tx({ amount: 200, category_id: null }),  // non classée → comptée
      tx({ amount: 50, category_id: null }),   // non classée → comptée
      tx({ amount: -30, category_id: null }),  // dépense → ignorée
    ];
    const r = computeUncategorizedIncome(txs);
    expect(r.count).toBe(2);
    expect(r.total).toBe(250);
  });

  it('renvoie zéro quand tout est classé', () => {
    const r = computeUncategorizedIncome([tx({ amount: 100, category_id: 'rev' })]);
    expect(r).toEqual({ count: 0, total: 0 });
  });
});

describe('computeKpis — CA filtré sur catégories revenu', () => {
  it("exclut du CA les positifs non classés ou en catégorie non-revenu", () => {
    const txs = [
      tx({ amount: 1000, category_id: 'rev' }),
      tx({ amount: 500, category_id: null }),   // non classé → hors CA
      tx({ amount: 300, category_id: 'exp' }),  // catégorie dépense → hors CA
      tx({ amount: -80, category_id: 'exp' }),  // dépense
    ];
    const k = computeKpis(txs, [], cats);
    expect(k.revenue).toBe(1000);
    expect(k.expense).toBe(80);
    expect(k.net).toBe(920);
  });
});

describe('cohérence CA annuel = somme des trimestres', () => {
  it('le total annuel égale la somme des 4 réels trimestriels', () => {
    const txs = [
      tx({ date: '2026-02-10', amount: 1000, category_id: 'rev' }), // T1
      tx({ date: '2026-05-10', amount: 2000, category_id: 'rev' }), // T2
      tx({ date: '2026-08-10', amount: 1500, category_id: 'rev' }), // T3
      tx({ date: '2026-11-10', amount: 500, category_id: 'rev' }),  // T4
      tx({ date: '2026-03-10', amount: 999, category_id: null }),   // non classé → exclu partout
    ];
    const qb = computeQuarterlyBreakdown(txs, 2026, [], [], cats);
    const somme = qb.reduce((s, q) => s + q.realRevenue, 0);
    expect(somme).toBe(5000);
    expect(qb.map(q => q.realRevenue)).toEqual([1000, 2000, 1500, 500]);
  });
});
