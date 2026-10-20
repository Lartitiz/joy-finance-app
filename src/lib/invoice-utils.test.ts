import { describe, it, expect } from 'vitest';
import {
  computeReceivables, daysLate, effectiveDueDate, parseInvoicesCsv, parseAmount, parseDate, parsePaid,
  type Invoice,
} from './invoice-utils';

const inv = (p: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36), number: null, client_name: 'Cliente', amount: 1000,
  date_issued: '2026-08-01', date_due: '2026-08-31', status: 'sent', paid_date: null, ...p,
});

describe('retards', () => {
  it('jours après l\'échéance, 0 si payée', () => {
    expect(daysLate(inv({}), '2026-10-20')).toBe(50);
    expect(daysLate(inv({ status: 'paid' }), '2026-10-20')).toBe(0);
    expect(daysLate(inv({}), '2026-08-31')).toBe(0);
  });
  it('sans échéance : 30 jours après l\'émission', () => {
    expect(effectiveDueDate(inv({ date_due: null }))).toBe('2026-08-31');
  });
});

describe('computeReceivables', () => {
  it('non payé, en retard et retards de plus de 30 jours', () => {
    const r = computeReceivables([
      inv({ id: 'a', amount: 1000 }),                                   // 50 j
      inv({ id: 'b', amount: 500, date_due: '2026-10-01' }),            // 19 j
      inv({ id: 'c', amount: 300, date_due: '2026-11-15' }),            // pas échue
      inv({ id: 'd', amount: 9999, status: 'paid' }),
      inv({ id: 'e', amount: 8888, status: 'cancelled' }),
      inv({ id: 'f', amount: 200, status: 'overdue', date_due: '2026-06-30' }), // 112 j
    ], '2026-10-20');
    expect(r.unpaidTotal).toBe(2000);
    expect(r.unpaidCount).toBe(4);
    expect(r.lateTotal).toBe(1700);
    expect(r.lateOver30.map(l => [l.invoice.id, l.days])).toEqual([['f', 112], ['a', 50]]);
  });
});

describe('lecture CSV', () => {
  it('montants et dates aux formats français et anglais', () => {
    expect(parseAmount('1 234,56 €')).toBe(1234.56);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('250')).toBe(250);
    expect(parseDate('05/10/2026')).toBe('2026-10-05');
    expect(parseDate('2025-11-04 12:33')).toBe('2025-11-04');
    expect(parsePaid('Payée')).toBe(true);
    expect(parsePaid('Non payée')).toBe(false);
    expect(parsePaid('En attente')).toBe(false);
  });

  it('export français séparé par des points-virgules', () => {
    const csv = '﻿Numéro;Client;Date d\'émission;Date d\'échéance;Montant HT;Montant TTC;Statut\n'
      + 'F202610-32;Atelier Rose;05/10/2026;04/11/2026;1 000,00;1 000,00;Non payée\n'
      + 'F202609-27;Studio B;12/09/2026;12/10/2026;800,00;800,00;Payée\n'
      + ';;;;;;\n'
      + 'F202609-28;;12/09/2026;;10;10;\n';
    const p = parseInvoicesCsv(csv);
    expect(p.missing).toEqual([]);
    expect(p.columns.amount).toBe('Montant TTC');
    expect(p.rows).toEqual([
      { number: 'F202610-32', client_name: 'Atelier Rose', amount: 1000, date_issued: '2026-10-05', date_due: '2026-11-04', paid: false },
      { number: 'F202609-27', client_name: 'Studio B', amount: 800, date_issued: '2026-09-12', date_due: '2026-10-12', paid: true },
    ]);
    expect(p.skipped).toBe(1);
  });

  it('export Stripe (virgules, montants entre guillemets)', () => {
    const csv = 'id,Amount Due,Customer,Date (UTC),Due Date (UTC),Number,Paid,Total,Status\n'
      + 'in_1,"250,00",cus_1,2025-11-04 12:33,,5A8B-0201,true,"250,00",paid\n';
    const p = parseInvoicesCsv(csv);
    expect(p.rows).toEqual([{ number: '5A8B-0201', client_name: 'cus_1', amount: 250, date_issued: '2025-11-04', date_due: null, paid: true }]);
  });

  it('signale les colonnes obligatoires manquantes', () => {
    expect(parseInvoicesCsv('Libellé;Montant\nx;10').missing).toEqual(['client', "date d'émission"]);
  });
});
