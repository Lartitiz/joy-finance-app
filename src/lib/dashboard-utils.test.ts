import { describe, it, expect } from 'vitest';
import {
  computeKpis,
  computeUncategorizedIncome,
  computeQuarterlyBreakdown,
  buildMonthlyChartData,
  computeTopCategories,
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
    // Dans l'app réelle, category_id et is_validated sont toujours posés ensemble
    // (voir CategorizeTransactions) : une transaction catégorisée est validée.
    is_validated: true,
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

  it("exclut du CA une transaction catégorisée mais pas encore validée", () => {
    const txs = [
      tx({ amount: 1000, category_id: 'rev', is_validated: true }),
      tx({ amount: 400, category_id: 'rev', is_validated: false }), // règle auto pas confirmée
    ];
    const k = computeKpis(txs, [], cats);
    expect(k.revenue).toBe(1000);
  });

  it("compte la rémunération à part, hors des vraies dépenses", () => {
    const catsWithRem: Category[] = [
      ...cats,
      { id: 'rem', name: 'Rémunération', emoji: '💸', color: null, type: 'remuneration' },
    ];
    const txs = [
      tx({ amount: 1000, category_id: 'rev' }),
      tx({ amount: -200, category_id: 'exp' }),  // vraie dépense
      tx({ amount: -600, category_id: 'rem' }),  // virement vers soi-même
    ];
    const k = computeKpis(txs, [], catsWithRem);
    expect(k.expense).toBe(200);
    expect(k.remuneration).toBe(600);
    expect(k.net).toBe(800); // revenue - vraies dépenses uniquement
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

const catsWithRem: Category[] = [
  ...cats,
  { id: 'rem', name: 'Rémunération', emoji: '💸', color: null, type: 'remuneration' },
];

describe('buildMonthlyChartData — mêmes règles que la carte « Résultat net »', () => {
  const txs = [
    tx({ date: '2026-01-10', amount: 3000, category_id: 'rev' }),
    tx({ date: '2026-01-12', amount: 200, category_id: 'rev', is_validated: false }), // non validé → hors CA
    tx({ date: '2026-01-15', amount: -500, category_id: 'exp' }),  // vraie dépense
    tx({ date: '2026-01-20', amount: -2000, category_id: 'rem' }), // rémunération → à part
    tx({ date: '2026-01-25', amount: -100, category_id: null }),   // sortie non classée → dépense
    tx({ date: '2026-02-05', amount: 1000, category_id: 'rev' }),
    tx({ date: '2026-02-06', amount: -1500, category_id: 'rem' }),
  ];
  const chart = buildMonthlyChartData(txs, 2026, [], [], catsWithRem);

  it('sort la rémunération des dépenses et du Net', () => {
    const jan = chart[0];
    expect(jan.revenue).toBe(3000);
    expect(jan.expense).toBe(600);
    expect(jan.remuneration).toBe(2000);
    expect(jan.net).toBe(2400);
    const feb = chart[1];
    expect(feb.expense).toBe(0);
    expect(feb.remuneration).toBe(1500);
    expect(feb.net).toBe(1000);
  });

  it("la somme du graphique sur l'année égale les cartes de la vue Année", () => {
    const k = computeKpis(txs, [], catsWithRem);
    const sum = (key: 'revenue' | 'expense' | 'net' | 'remuneration') => chart.reduce((s, m) => s + m[key], 0);
    expect(sum('revenue')).toBe(k.revenue);
    expect(sum('expense')).toBe(k.expense);
    expect(sum('net')).toBe(k.net);
    expect(sum('remuneration')).toBe(k.remuneration);
  });
});

describe('computeTopCategories — répartitions alignées sur les cartes', () => {
  const catsAll: Category[] = [
    ...catsWithRem,
    { id: 'both', name: 'Divers', emoji: null, color: null, type: 'both' },
  ];
  const txs = [
    tx({ amount: 1000, category_id: 'rev' }),
    tx({ amount: 300, category_id: 'rev', is_validated: false }), // non validé → hors CA
    tx({ amount: 250, category_id: 'both' }),                     // pas une catégorie revenu → hors CA
    tx({ amount: -400, category_id: 'exp' }),
    tx({ amount: -2000, category_id: 'rem' }),                    // rémunération → hors dépenses
  ];

  it('les revenus ne prennent que le CA', () => {
    const top = computeTopCategories(txs, catsAll, 'revenue');
    expect(top.map(c => [c.categoryId, c.total])).toEqual([['rev', 1000]]);
    expect(top.reduce((s, c) => s + c.total, 0)).toBe(computeKpis(txs, [], catsAll).revenue);
  });

  it('les dépenses excluent la rémunération', () => {
    const top = computeTopCategories(txs, catsAll, 'expense');
    expect(top.map(c => [c.categoryId, c.total])).toEqual([['exp', 400]]);
  });
});
