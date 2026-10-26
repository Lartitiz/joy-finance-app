// Tests sans réseau de la reprise sur erreur réseau (lundi 8 h, Wi-Fi pas encore remonté).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FormatError } from '../src/format.ts';
import {
  IndyUnreachable, SessionExpired, formatDelay, networkReason, readIndyFromPage, withRetry, type IndyPage,
} from '../src/indy.ts';

const invoice = {
  id: 'i1', fullNumber: 'F202609-31', status: 'PENDING', type: 'INVOICE', date: '2026-09-14',
  title: 'Atelier', totalTTC: 20000, delaiDePaiementDays: 30,
  client: { type: 'INDIVIDUAL', firstName: 'Ines', lastName: 'La Silhouettiste' },
};
const quote = {
  id: 'q1', fullNumber: 'D202609-26', status: 'ACCEPTED', totalTTC: 15000, issuanceDate: '2026-09-30',
  expirationDate: '2026-10-30', invoiceDraftIds: [], client: { companyName: 'Client' }, title: 'Formation',
};
const responses: Record<string, unknown> = {
  '/api/end-user/me': { id: 'u1' },
  '/api/facturation-invoices/documents/invoices': { invoices: [invoice], pagination: { total: 1 } },
  '/api/facturation-invoices/documents/quotations': { quotations: [quote], pagination: { total: 1 } },
  '/api/facturation/invoices/kpis': { kpis: { totalInvoicedAmount: { totalTTCInCents: 20000 }, waitingForPaymentAmount: { totalTTCInCents: 20000 } } },
  '/api/facturation/quotations/kpis': { kpis: { totalQuotationsAmount: { totalTTCInCents: 15000 }, totalQuotationsPendingAmount: { totalTTCInCents: 0 } } },
  '/api/facturation/invoices/count': { count: 1 },
  '/api/facturation/quotations/count': { count: 1 },
};

/** Erreur telle que Playwright la remonte quand la page n'a pas pu joindre Indy. */
const failedToFetch = () => new Error('page.evaluate: TypeError: Failed to fetch\n    at https://static.indy.fr/assets/vendor-monitoring-BFLmcn30.js:3:3192');

/** Page Indy simulée : `fail` décide, pour chaque requête dans l'ordre, de l'erreur ou du code HTTP. */
function fakePage(fail: (n: number, path: string) => Error | number | undefined) {
  const calls: string[] = [];
  const page = {
    goto: async () => null,
    evaluate: async (_fn: unknown, arg: { p: string }) => {
      const path = arg.p.split('?')[0];
      calls.push(path);
      const f = fail(calls.length, path);
      if (f instanceof Error) throw f;
      return { status: f ?? 200, text: JSON.stringify(responses[path]) };
    },
  };
  return { page: page as unknown as IndyPage, calls };
}

/** Attente simulée + capture du journal. */
function harness() {
  const sleeps: number[] = [];
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg: string) => { lines.push(msg); };
  const retry = { sleep: async (ms: number) => { sleeps.push(ms); } };
  const restore = () => { console.log = original; };
  return { sleeps, lines, retry, restore };
}

test('2 échecs réseau puis succès : la lecture aboutit, après 30 s puis 2 min', async () => {
  const h = harness();
  try {
    const { page, calls } = fakePage(n => (n <= 2 ? failedToFetch() : undefined));
    const { invoices, quotes } = await readIndyFromPage(page, h.retry);
    assert.equal(invoices.length, 1);
    assert.equal(invoices[0].number, 'F202609-31');
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].status, 'signed');
    assert.deepEqual(h.sleeps, [30_000, 120_000]);
    assert.equal(calls.filter(c => c === '/api/end-user/me').length, 3);
    const retries = h.lines.filter(l => l.includes('nouvelle tentative'));
    assert.equal(retries.length, 2);
    assert.match(retries[0], /Indy ne répond pas \(Failed to fetch\), nouvelle tentative 2\/4 dans 30 s$/);
    assert.match(retries[1], /nouvelle tentative 3\/4 dans 2 min$/);
  } finally {
    h.restore();
  }
});

test('session expirée (401) : aucune nouvelle tentative, arrêt immédiat', async () => {
  const h = harness();
  try {
    const { page, calls } = fakePage((_n, path) => (path === '/api/end-user/me' ? 401 : undefined));
    await assert.rejects(readIndyFromPage(page, h.retry), SessionExpired);
    assert.deepEqual(h.sleeps, []);
    assert.deepEqual(calls, ['/api/end-user/me']);
  } finally {
    h.restore();
  }
});

test('erreur de format (500) : pas réessayée non plus', async () => {
  const h = harness();
  try {
    const { page, calls } = fakePage((_n, path) => (path === '/api/end-user/me' ? 500 : undefined));
    await assert.rejects(readIndyFromPage(page, h.retry), FormatError);
    assert.deepEqual(h.sleeps, []);
    assert.equal(calls.length, 1);
  } finally {
    h.restore();
  }
});

test('4 échecs réseau : arrêt « Indy injoignable » après 30 s + 2 min + 5 min', async () => {
  const h = harness();
  try {
    const { page, calls } = fakePage(() => failedToFetch());
    await assert.rejects(readIndyFromPage(page, h.retry), (err: unknown) => {
      assert.ok(err instanceof IndyUnreachable);
      assert.equal(err.message, 'lecture de /api/end-user/me : Failed to fetch à chacune des 4 tentatives sur 7 min 30 s');
      return true;
    });
    assert.deepEqual(h.sleeps, [30_000, 120_000, 300_000]);
    assert.equal(calls.length, 4);
  } finally {
    h.restore();
  }
});

test('chargement de la page : délai dépassé et coupure réseau sont repris, pas le reste', async () => {
  const h = harness();
  try {
    let n = 0;
    const page = {
      goto: async () => {
        n++;
        if (n === 1) throw new Error('page.goto: Timeout 60000ms exceeded.\nCall log:\n  - navigating to "https://app.indy.fr/facturation/factures"');
        if (n === 2) throw new Error('page.goto: net::ERR_INTERNET_DISCONNECTED at https://app.indy.fr/facturation/factures');
        return null;
      },
      evaluate: async (_fn: unknown, arg: { p: string }) => ({ status: 200, text: JSON.stringify(responses[arg.p.split('?')[0]]) }),
    } as unknown as IndyPage;
    const { invoices } = await readIndyFromPage(page, h.retry);
    assert.equal(invoices.length, 1);
    assert.equal(n, 3);
    assert.deepEqual(h.sleeps, [30_000, 120_000]);
    assert.match(h.lines[0], /page Indy pas chargée en 60 s/);
    assert.match(h.lines[1], /net::ERR_INTERNET_DISCONNECTED/);
  } finally {
    h.restore();
  }
});

test('withRetry : une erreur quelconque n\'est pas réessayée', async () => {
  const h = harness();
  try {
    let n = 0;
    await assert.rejects(withRetry('x', async () => { n++; throw new Error('Chrome ne démarre pas'); }, h.retry), /Chrome ne démarre pas/);
    assert.equal(n, 1);
    assert.equal(networkReason(new Error('page.evaluate: Execution context was destroyed')), null);
    assert.equal(networkReason(new Error('TimeoutError: signal timed out')), 'pas de réponse en 60 s');
    assert.equal(formatDelay(30_000), '30 s');
    assert.equal(formatDelay(120_000), '2 min');
    assert.equal(formatDelay(450_000), '7 min 30 s');
  } finally {
    h.restore();
  }
});
