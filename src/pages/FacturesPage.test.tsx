import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const rows = [
  { id: '1', number: 'F202608-10', client_name: 'Atelier Rose', amount: 1200, date_issued: '2026-01-05', date_due: '2026-02-04', status: 'sent', paid_date: null },
  { id: '2', number: 'F202609-27', client_name: 'Studio B', amount: 800, date_issued: '2026-09-12', date_due: null, status: 'paid', paid_date: '2026-09-20' },
];
const auth = { user: { id: 'u1' } };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = { select: () => chain, eq: () => chain, order: () => Promise.resolve({ data: rows, error: null }) };
  return { supabase: { from: () => chain } };
});

import FacturesPage from './FacturesPage';

describe('FacturesPage', () => {
  it('liste les non payées avec leur retard et les totaux', async () => {
    render(<FacturesPage />);
    await waitFor(() => expect(screen.getByText('Atelier Rose')).toBeInTheDocument());
    expect(screen.queryByText('Studio B')).toBeNull(); // payée : masquée par défaut
    expect(screen.getByText(/j de retard/)).toBeInTheDocument();
    expect(document.body.textContent).toContain('1\u202f200,00');
  });
});
