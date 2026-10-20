import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { reconstituteBalance, pendingProvisions, treasuryFetchStart, accountStartDate, type TreasuryAccount } from './treasury-utils';
import { defaultSettings, effectiveSettings } from './declaration-utils';
import type { Transaction, Category } from './dashboard-utils';

const cats: Category[] = [{ id: 'rev', name: 'Presta', emoji: null, color: null, type: 'revenue' }];
const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-10-05', label: 'x', amount: 0,
  category_id: 'rev', source: 'import', is_validated: true, ...p,
});
const acc = (p: Partial<TreasuryAccount>): TreasuryAccount => ({
  id: 'a', name: 'Pro', current_balance: 5000, last_updated: '2026-09-30', created_at: '2026-03-01T10:00:00Z', ...p,
});
const settingsFor = (y: number) => effectiveSettings(defaultSettings(), y);

describe('reconstituteBalance', () => {
  it('solde de départ + mouvements strictement après la date', () => {
    const b = reconstituteBalance([acc({})], [
      tx({ date: '2026-09-30', amount: 999 }), // déjà dans le solde de fin de journée
      tx({ date: '2026-10-01', amount: 1000 }),
      tx({ date: '2026-10-02', amount: -300, category_id: null }),
    ]);
    expect(b).toEqual({ total: 5700, startingTotal: 5000, fromDate: '2026-09-30', movements: 700 });
  });

  it('sans date de mise à jour : date de création du compte', () => {
    expect(accountStartDate(acc({ last_updated: null }))).toBe('2026-03-01');
  });

  it('plusieurs comptes : chaque mouvement compté une fois, depuis la date la plus récente', () => {
    const b = reconstituteBalance([acc({}), acc({ id: 'b', current_balance: 1000, last_updated: '2026-10-01' })],
      [tx({ date: '2026-10-01', amount: 50 }), tx({ date: '2026-10-02', amount: 100 })]);
    expect(b.total).toBe(6100);
  });

  it('aucun compte : 0', () => {
    expect(reconstituteBalance([], [tx({ amount: 100 })]).total).toBe(0);
  });
});

describe('pendingProvisions', () => {
  const txs = [
    tx({ date: '2026-08-10', amount: 10000 }), // T3
    tx({ date: '2026-10-05', amount: 5000 }),  // T4
  ];

  it('avant le 31/10 : T3 à payer + T4 en cours', () => {
    const p = pendingProvisions(txs, cats, settingsFor, '2026-10-20');
    expect(p.previous).toEqual({ year: 2026, quarter: 3, dueDate: '2026-10-31', amount: 2580, late: false });
    expect(p.current.amount).toBe(1290);
    expect(p.tva).toBe(0);
    expect(p.total).toBe(3870);
  });

  it('le T3 sort des provisions dès que son prélèvement URSSAF est importé', () => {
    const paid = [...txs, tx({ date: '2026-10-30', amount: -2580, label: 'PRLV SEPA URSSAF BOURGOGNE', category_id: null })];
    const p = pendingProvisions(paid, cats, settingsFor, '2026-11-02');
    expect(p.previous).toBeNull();
    expect(p.total).toBe(1290);
  });

  it('sans prélèvement importé, le T3 reste dû et passe en retard après le 31/10', () => {
    const p = pendingProvisions(txs, cats, settingsFor, '2026-11-02');
    expect(p.previous).toMatchObject({ quarter: 3, amount: 2580, late: true });
  });

  it('un prélèvement URSSAF daté dans le trimestre ne paie pas ce trimestre', () => {
    const early = [...txs, tx({ date: '2026-08-04', amount: -2863, label: 'PRLV SEPA URSSAF BOURGOGNE', category_id: null })];
    expect(pendingProvisions(early, cats, settingsFor, '2026-10-20').previous).not.toBeNull();
  });

  it('en janvier : le T4 de l\'année précédente reste dû jusqu\'au 31/01', () => {
    const p = pendingProvisions([tx({ date: '2026-11-10', amount: 1000 })], cats, settingsFor, '2027-01-15');
    expect(p.previous).toMatchObject({ year: 2026, quarter: 4, dueDate: '2027-01-31', amount: 258 });
  });

  it('TVA collectée depuis l\'assujettissement', () => {
    const withTva = (y: number) => ({ ...settingsFor(y), tvaStartDate: '2027-01-01' });
    const p = pendingProvisions([tx({ date: '2027-01-10', amount: 1200 })], cats, withTva, '2027-01-20');
    expect(p.tva).toBeCloseTo(200);
    expect(p.current.amount).toBe(258); // 25,8 % de 1 000 HT
  });
});

describe('treasuryFetchStart', () => {
  it('la plus ancienne des dates utiles', () => {
    expect(treasuryFetchStart([acc({})], settingsFor(2026), '2026-10-20')).toBe('2026-07-01');
    expect(treasuryFetchStart([acc({ last_updated: '2026-01-15' })], settingsFor(2026), '2026-10-20')).toBe('2026-01-15');
  });
});
