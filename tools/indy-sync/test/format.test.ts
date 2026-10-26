// Tests sans réseau de la lecture des données Indy (structures relevées le 20/10/2026).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FormatError, checkTotals, readPage, readTotals, toInvoiceRow, toQuoteRow } from '../src/format.ts';

const invoice = {
  id: 'i1', fullNumber: 'F202609-31', status: 'PENDING', type: 'INVOICE', date: '2026-09-14',
  title: 'Atelier', totalTTC: 20000, delaiDePaiementDays: 30,
  client: { type: 'INDIVIDUAL', firstName: 'Ines', lastName: 'La Silhouettiste' },
};

test('facture : montant en euros, échéance = émission + délai, nom du client', () => {
  assert.deepEqual(toInvoiceRow(invoice), {
    number: 'F202609-31', client_name: 'Ines La Silhouettiste', description: 'Atelier',
    amount: 200, date_issued: '2026-09-14', date_due: '2026-10-14', status: 'sent',
  });
});

test('avoir payé : montant négatif, raison sociale', () => {
  const row = toInvoiceRow({ ...invoice, type: 'CREDIT_NOTE', status: 'PAID', totalTTC: -75000,
    client: { type: 'ENTITY', companyName: '104 CENT QUATRE' } });
  assert.equal(row.amount, -750);
  assert.equal(row.status, 'paid');
  assert.equal(row.client_name, '104 CENT QUATRE');
});

test('statut ou type inconnu, montant non entier, date absente : arrêt clair', () => {
  assert.throws(() => toInvoiceRow({ ...invoice, status: 'PARTIALLY_PAID' }), /statut Indy inconnu/);
  assert.throws(() => toInvoiceRow({ ...invoice, type: 'PROFORMA' }), /type Indy inconnu/);
  assert.throws(() => toInvoiceRow({ ...invoice, totalTTC: '200,00' }), FormatError);
  assert.throws(() => toInvoiceRow({ ...invoice, date: undefined }), /« date »/);
  assert.throws(() => toInvoiceRow({ ...invoice, client: {} }), /client sans nom/);
});

const quote = {
  id: 'q1', fullNumber: 'D202609-26', status: 'ACCEPTED', totalTTC: 15000, issuanceDate: '2026-09-30',
  expirationDate: '2026-10-30', invoiceDraftIds: [], client: { companyName: 'Client' }, title: 'Formation',
};

test('devis : signé, facturé (facture issue du devis), en attente', () => {
  assert.equal(toQuoteRow(quote, new Set()).status, 'signed');
  assert.equal(toQuoteRow(quote, new Set(['q1'])).status, 'invoiced');
  assert.equal(toQuoteRow({ ...quote, invoiceDraftIds: ['d'] }, new Set()).status, 'invoiced');
  assert.equal(toQuoteRow({ ...quote, status: 'PENDING' }, new Set()).status, 'pending');
  assert.throws(() => toQuoteRow({ ...quote, status: 'SIGNED_ONLINE' }, new Set()), /statut Indy inconnu/);
});

test('page de liste : structure vérifiée', () => {
  assert.deepEqual(readPage({ invoices: [1], pagination: { total: 1 } }, 'invoices'), { items: [1], total: 1 });
  assert.throws(() => readPage({ data: [] }, 'invoices'), /structure de réponse inattendue/);
});

const quoteKpis = (acceptedCents: number, pendingCents: number) => ({ kpis: {
  totalQuotationsAmount: { totalTTCInCents: acceptedCents + pendingCents },
  totalQuotationsAcceptedAmount: { totalTTCInCents: acceptedCents },
  totalQuotationsPendingAmount: { totalTTCInCents: pendingCents },
} });

test('totaux : concordance et écart signalé', () => {
  const totals = readTotals(
    { kpis: { totalInvoicedAmount: { totalTTCInCents: 20000 }, waitingForPaymentAmount: { totalTTCInCents: 20000 } } },
    quoteKpis(15000, 0),
    { count: 1 }, { count: 1 },
  );
  const inv = [toInvoiceRow(invoice)];
  const q = [toQuoteRow(quote, new Set())];
  assert.deepEqual(checkTotals(inv, q, totals), []);
  assert.match(checkTotals([], q, totals).join(), /nombre de factures : lu 0, Indy affiche 1/);
  assert.throws(() => readTotals({}, {}, { count: 1 }, { count: 1 }), /totaux Indy/);
});

test('totaux des devis : un devis refusé compte dans le nombre, pas dans les montants (Indy, 26/10/2026)', () => {
  const invKpis = { kpis: { totalInvoicedAmount: { totalTTCInCents: 20000 }, waitingForPaymentAmount: { totalTTCInCents: 20000 } } };
  const inv = [toInvoiceRow(invoice)];
  const signed = toQuoteRow(quote, new Set());
  const pending = toQuoteRow({ ...quote, id: 'q2', fullNumber: 'D202610-29', status: 'PENDING', totalTTC: 20000 }, new Set());
  const refused = toQuoteRow({ ...quote, id: 'q3', fullNumber: 'D202608-24', status: 'REFUSED', totalTTC: 8000 }, new Set());
  const totals = readTotals(invKpis, quoteKpis(15000, 20000), { count: 1 }, { count: 3 });
  assert.deepEqual(checkTotals(inv, [signed, pending, refused], totals), []);
  const gaps = checkTotals(inv, [signed, pending], readTotals(invKpis, quoteKpis(15000, 20000), { count: 1 }, { count: 2 }));
  assert.deepEqual(gaps, []);
  const wrong = checkTotals(inv, [signed, pending, refused], readTotals(invKpis, quoteKpis(23000, 20000), { count: 1 }, { count: 3 }));
  assert.match(wrong.join(' ; '), /total des devis \(signés \+ en attente\) : lu 350,00 €, Indy affiche 430,00 €/);
  assert.match(wrong.join(' ; '), /devis signés : lu 150,00 €, Indy affiche 230,00 €/);
});
