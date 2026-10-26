// Tri des changements de la synchro (forme réelle de la réponse indy_sync du 26/10/2026).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InvoiceRow, QuoteRow } from '../src/format.ts';
import { weekChanges, type SyncResult } from '../src/semaine.ts';

const inv = (number: string, client_name: string, amount: number, status: InvoiceRow['status']): InvoiceRow => ({
  number, client_name, description: null, amount, date_issued: '2026-10-20', date_due: '2026-11-19', status,
} as InvoiceRow);
const quo = (number: string, client_name: string, amount: number, status: QuoteRow['status'], title: string | null = null): QuoteRow => ({
  number, client_name, title, amount, date_issued: '2026-10-20', date_expires: '2026-11-20', status,
});

const invoices = [
  inv('F202610-44', 'Ville', 1300, 'sent'), inv('F202610-43', 'Ville', -1300, 'paid'),
  inv('F202610-37', 'Ville', 1300, 'paid'), inv('F202610-34', 'Oasis', 900, 'paid'),
  inv('F202610-20', 'Annulée', 100, 'cancelled'), inv('F202610-10', 'Échéance', 500, 'sent'),
];
const quotes = [
  quo('D202610-31', 'Mairie de Village', 2850, 'pending'), quo('D202610-30', 'IMCI', 900, 'invoiced'),
  quo('D202610-28', 'Client', 4867.5, 'invoiced', 'Atelier'), quo('D202608-24', 'Prospect', 80, 'refused'),
];
const result: SyncResult = {
  factures: {
    nouvelles: [invoices[0], invoices[1], invoices[2]],
    mises_a_jour: [
      { number: 'F202610-34', avant: { number: 'F202610-34', status: 'sent', date_due: '2026-11-07', paid_date: null }, apres: { status: 'paid', date_due: '2026-11-07', paid_date: null } },
      { number: 'F202610-20', avant: { status: 'sent' }, apres: { status: 'cancelled' } },
      { number: 'F202610-10', avant: { status: 'sent', date_due: '2026-11-01' }, apres: { status: 'sent', date_due: '2026-11-08' } },
    ],
    inchangees: 30,
    ecarts: [{ number: 'F202609-1', ecart: 'payée dans l\'app, pas dans Indy' }],
  },
  devis: {
    nouveaux: [quotes[0], quotes[1]],
    mis_a_jour: [{ number: 'D202610-28', avant: 'pending', apres: 'invoiced' }, { number: 'D202608-24', avant: 'pending', apres: 'refused' }],
    inchanges: 22,
  },
};

test('changements triés : payées, émises, avoirs, annulées, devis nouveaux, signés, refusés', () => {
  const c = weekChanges(result, invoices, quotes, '2026-10-21');
  assert.equal(c.since, '2026-10-21');
  assert.deepEqual(c.paid, [{ number: 'F202610-34', client_name: 'Oasis', amount: 900 }]);
  assert.deepEqual(c.invoiced.map(l => [l.number, l.note]), [['F202610-44', undefined], ['F202610-37', 'déjà payée']]);
  assert.deepEqual(c.creditNotes.map(l => l.number), ['F202610-43']);
  assert.deepEqual(c.cancelledInvoices.map(l => l.number), ['F202610-20']);
  assert.deepEqual(c.newQuotes.map(l => l.number), ['D202610-31']);
  assert.deepEqual(c.signedQuotes.map(l => [l.number, l.note]), [['D202610-30', 'nouveau, déjà facturé'], ['D202610-28', 'déjà facturé']]);
  assert.equal(c.signedQuotes[1].title, 'Atelier');
  assert.deepEqual(c.refusedQuotes.map(l => l.number), ['D202608-24']);
  assert.deepEqual(c.gaps, ['facture F202609-1 : payée dans l\'app, pas dans Indy']);
});

test('un changement d\'échéance seul ou un devis déjà signé qui passe facturé ne sont pas cités', () => {
  const c = weekChanges({ ...result, factures: { ...result.factures, nouvelles: [], mises_a_jour: [result.factures.mises_a_jour[2]], ecarts: [] },
    devis: { nouveaux: [], mis_a_jour: [{ number: 'D202610-28', avant: 'signed', apres: 'invoiced' }], inchanges: 0 } }, invoices, quotes, null);
  assert.equal(c.paid.length + c.invoiced.length + c.cancelledInvoices.length + c.signedQuotes.length + c.refusedQuotes.length, 0);
});
