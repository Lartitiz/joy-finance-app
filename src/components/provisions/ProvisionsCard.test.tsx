import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvisionsCard } from './ProvisionsCard';
import { defaultSettings, effectiveSettings } from '@/lib/declaration-utils';
import { computeProvisions, urssafDeadline } from '@/lib/provision-utils';
import type { Category, Transaction } from '@/lib/dashboard-utils';

const cats: Category[] = [{ id: 'rev', name: 'Presta', emoji: null, color: null, type: 'revenue' }];
const txs: Transaction[] = [
  { id: '1', date: '2026-08-10', label: 'x', amount: 10000, category_id: 'rev', source: 'import', is_validated: true },
];

describe('ProvisionsCard', () => {
  it('affiche total, vraiment à toi et échéance ; pas de ligne TVA en franchise', () => {
    const s = effectiveSettings(defaultSettings(), 2026);
    render(<ProvisionsCard periodLabel="T3 2026" provisions={computeProvisions(txs, cats, s)} settings={s}
      deadline={urssafDeadline(txs, cats, s, 2026, 3, '2026-10-20')} />);
    expect(screen.getByText('À mettre de côté · T3 2026')).toBeInTheDocument();
    expect(screen.getByText('Vraiment à toi')).toBeInTheDocument();
    expect(screen.getByText('31 octobre 2026')).toBeInTheDocument();
    expect(screen.queryByText(/TVA collectée/)).toBeNull();
    expect(document.body.textContent).toContain('7 420,00');
  });

  it('affiche la TVA collectée une fois assujettie', () => {
    const s = { ...effectiveSettings(defaultSettings(), 2026), tvaStartDate: '2026-07-01' };
    render(<ProvisionsCard periodLabel="T3 2026" provisions={computeProvisions(txs, cats, s)} settings={s}
      deadline={urssafDeadline(txs, cats, s, 2026, 3, '2026-10-20')} />);
    expect(screen.getByText(/TVA collectée \(20 %\)/)).toBeInTheDocument();
  });
});
