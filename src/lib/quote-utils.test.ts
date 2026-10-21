import { describe, it, expect } from 'vitest';
import { computePendingQuotes, daysSinceIssued, isExpired, type Quote } from './quote-utils';

const q = (p: Partial<Quote>): Quote => ({
  id: Math.random().toString(36), number: 'D1', client_name: 'Cliente', title: null, amount: 1000,
  date_issued: '2026-10-01', date_expires: '2026-10-31', status: 'pending', ...p,
});

const TODAY = '2026-10-21';

describe('isExpired', () => {
  it('expire aujourd\'hui : encore valable, hier : expiré', () => {
    expect(isExpired(q({ date_expires: TODAY }), TODAY)).toBe(false);
    expect(isExpired(q({ date_expires: '2026-10-20' }), TODAY)).toBe(true);
  });
  it('sans date d\'expiration : valable ; statut expired : expiré', () => {
    expect(isExpired(q({ date_expires: null }), TODAY)).toBe(false);
    expect(isExpired(q({ status: 'expired', date_expires: null }), TODAY)).toBe(true);
  });
  it('un devis facturé ou signé n\'est jamais expiré', () => {
    expect(isExpired(q({ status: 'invoiced', date_expires: '2026-01-01' }), TODAY)).toBe(false);
    expect(isExpired(q({ status: 'signed', date_expires: '2026-01-01' }), TODAY)).toBe(false);
  });
});

describe('daysSinceIssued', () => {
  it('jours depuis l\'émission', () => {
    expect(daysSinceIssued(q({ date_issued: '2026-10-01' }), TODAY)).toBe(20);
    expect(daysSinceIssued(q({ date_issued: TODAY }), TODAY)).toBe(0);
  });
});

describe('computePendingQuotes', () => {
  // Cas réel du 21/10/2026 : 7 devis en attente pour 13 217,50 € chez Indy,
  // dont 2 encore valables (COOPERATIVE OASIS) et 5 expirés.
  const real = [
    q({ id: '28', number: 'D202610-28', client_name: 'COOPERATIVE OASIS', amount: 4867.5, date_issued: '2026-10-20', date_expires: '2026-11-19' }),
    q({ id: '27', number: 'D202610-27', client_name: 'COOPERATIVE OASIS', amount: 2420, date_issued: '2026-10-20', date_expires: '2026-11-19' }),
    q({ id: 'e1', amount: 1200, date_issued: '2026-01-10', date_expires: '2026-02-09' }),
    q({ id: 'e2', amount: 1500, date_issued: '2026-03-10', date_expires: '2026-04-09' }),
    q({ id: 'e3', amount: 1000, date_issued: '2026-06-10', date_expires: '2026-07-10' }),
    q({ id: 'e4', amount: 1130, date_issued: '2026-07-15', date_expires: '2026-08-14' }),
    q({ id: 'e5', amount: 1100, date_issued: '2026-07-20', date_expires: '2026-08-19' }),
    q({ id: 'f', status: 'invoiced', amount: 9999 }),
  ];

  it('sépare les devis valables des expirés, total identique à Indy', () => {
    const r = computePendingQuotes(real, TODAY);
    expect(r.pending.count).toBe(2);
    expect(r.pending.total).toBe(7287.5);
    expect(r.expired.count).toBe(5);
    expect(r.pending.total + r.expired.total).toBe(13217.5);
    expect(r.signed.count).toBe(0);
  });

  it('tris : valables par expiration, expirés du plus récent au plus ancien, signés du plus ancien', () => {
    const r = computePendingQuotes([
      ...real,
      q({ id: 'p-late', date_expires: '2026-12-31' }),
      q({ id: 'p-none', date_expires: null }),
      q({ id: 's2', status: 'signed', date_issued: '2026-09-01' }),
      q({ id: 's1', status: 'signed', date_issued: '2026-08-01' }),
    ], TODAY);
    expect(r.pending.quotes.map(x => x.id)).toEqual(['28', '27', 'p-late', 'p-none']);
    expect(r.expired.quotes.map(x => x.id)).toEqual(['e5', 'e4', 'e3', 'e2', 'e1']);
    expect(r.signed.quotes.map(x => x.id)).toEqual(['s1', 's2']);
    expect(r.signed.total).toBe(2000);
  });

  it('ignore refusés, annulés et facturés', () => {
    const r = computePendingQuotes([
      q({ status: 'refused' }), q({ status: 'cancelled' }), q({ status: 'invoiced' }),
    ], TODAY);
    expect(r.pending.count + r.expired.count + r.signed.count).toBe(0);
  });

  it('montants reçus en texte additionnés comme des nombres', () => {
    const r = computePendingQuotes([q({ amount: '10.10' as unknown as number }), q({ amount: 0.2 })], TODAY);
    expect(r.pending.total).toBe(10.3);
  });
});
