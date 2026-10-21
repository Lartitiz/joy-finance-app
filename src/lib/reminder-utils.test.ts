import { describe, it, expect } from 'vitest';
import { groupByClient, clientKey } from './reminder-utils';
import type { Invoice } from './invoice-utils';

const inv = (p: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36), number: null, client_name: 'Cliente', amount: 1000,
  date_issued: '2026-08-01', date_due: '2026-08-31', status: 'sent', paid_date: null, ...p,
});
const TODAY = '2026-10-21';

describe('groupByClient', () => {
  it('un bloc par client non payé : total avec avoirs, nombre, plus grand retard', () => {
    const list = groupByClient([
      inv({ client_name: 'Saint Aubin', amount: 500, date_due: '2026-09-01' }),   // 50 j
      inv({ client_name: 'saint aubin ', amount: 242.5, date_due: '2026-10-11' }), // 10 j
      inv({ client_name: 'Saint Aubin', amount: 9999, status: 'paid' }),
      inv({ client_name: 'OASIS', amount: -1334, date_due: '2026-01-01' }),
      inv({ client_name: 'Annulée', amount: 100, status: 'cancelled' }),
      inv({ client_name: 'Pas échue', amount: 300, date_due: '2026-11-15', status: 'overdue' }),
    ], [], TODAY);
    expect(list.map(g => [g.name, g.total, g.count, g.maxDaysLate])).toEqual([
      ['Saint Aubin', 742.5, 2, 50],
      ['Pas échue', 300, 1, 0],
      ['OASIS', -1334, 1, 0],
    ]);
  });

  it('mis en avant : plus de 30 jours de retard et pas relancé depuis 15 jours', () => {
    const invoices = [
      inv({ client_name: 'Jamais relancé', date_due: '2026-09-01' }),      // 50 j
      inv({ client_name: 'Relancé hier', date_due: '2026-08-01' }),        // 81 j
      inv({ client_name: 'Relancé il y a 15 j', date_due: '2026-09-01' }),
      inv({ client_name: 'Retard 30 j', date_due: '2026-09-21' }),         // 30 j pile
      inv({ client_name: 'Avoir', amount: -500, date_due: '2026-01-01' }),
    ];
    const list = groupByClient(invoices, [
      { client_name: 'relancé hier', reminded_at: '2026-10-20' },
      { client_name: 'Relancé il y a 15 j', reminded_at: '2026-09-01' },
      { client_name: 'Relancé il y a 15 j', reminded_at: '2026-10-06' },
    ], TODAY);
    const urgent = Object.fromEntries(list.map(g => [g.name, g.urgent]));
    expect(urgent).toEqual({
      'Jamais relancé': true, 'Relancé hier': false, 'Relancé il y a 15 j': true,
      'Retard 30 j': false, Avoir: false,
    });
    expect(list.slice(0, 2).map(g => g.name)).toEqual(['Jamais relancé', 'Relancé il y a 15 j']);
    expect(list.find(g => g.name === 'Relancé hier')?.lastReminder).toBe('2026-10-20');
    expect(list.find(g => g.name === 'Relancé il y a 15 j')?.lastReminder).toBe('2026-10-06');
  });

  it('nom de client sans tenir compte de la casse ni des espaces', () => {
    expect(clientKey('  La  Ressourcerie du Pont ')).toBe('la ressourcerie du pont');
  });
});
