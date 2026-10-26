// Lecture d'Indy depuis une page Chrome connectée (requêtes GET uniquement, aucun clic),
// avec reprise sur les erreurs réseau : le lundi à 8 h le Mac se réveille et le Wi-Fi
// n'est pas toujours remonté quand la synchro part.
import type { Page } from 'playwright';
import {
  FormatError, checkTotals, readPage, readTotals, toInvoiceRow, toQuoteRow,
  type InvoiceRow, type QuoteRow,
} from './format.ts';
import { INDY, log } from './outils.ts';

const PAGE_SIZE = 100;
const PAGE_LOAD_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 60_000;
/** Attentes avant chaque nouvelle tentative : 30 s, 2 min, 5 min (4 tentatives en tout). */
export const RETRY_DELAYS_MS = [30_000, 120_000, 300_000];

export class SessionExpired extends Error {}
/** Indy n'a répondu à aucune des tentatives : erreur réseau, pas un problème de données. */
export class IndyUnreachable extends Error {}

/** Ce que la lecture utilise d'une page Playwright (remplaçable par une page simulée dans les tests). */
export type IndyPage = Pick<Page, 'goto' | 'evaluate'>;

export interface RetryOptions {
  /** Attentes entre deux tentatives, en millisecondes. */
  delays?: number[];
  /** Fonction d'attente (remplacée dans les tests pour ne pas attendre). */
  sleep?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Motif court si l'erreur est une erreur réseau (à réessayer), sinon null.
 * Jamais une session expirée ni une erreur de format : celles-là ne se réparent pas en attendant.
 */
export function networkReason(err: unknown): string | null {
  if (err instanceof SessionExpired || err instanceof FormatError) return null;
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/Failed to fetch|net::ERR_[A-Z0-9_]+|Timeout \d+ms exceeded|signal timed out|NetworkError|Load failed/i);
  if (!m) return null;
  if (/^Timeout/i.test(m[0])) return 'page Indy pas chargée en 60 s';
  if (/timed out/i.test(m[0])) return 'pas de réponse en 60 s';
  return m[0];
}

export function formatDelay(ms: number): string {
  const min = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  if (min === 0) return `${s} s`;
  return s === 0 ? `${min} min` : `${min} min ${s} s`;
}

/** Exécute `fn` et recommence après chaque erreur réseau ; toute autre erreur est relancée telle quelle. */
export async function withRetry<T>(what: string, fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  const wait = opts.sleep ?? sleep;
  const attempts = delays.length + 1;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const reason = networkReason(err);
      if (!reason) throw err;
      if (attempt >= attempts) {
        const total = formatDelay(delays.reduce((a, b) => a + b, 0));
        throw new IndyUnreachable(`${what} : ${reason} à chacune des ${attempts} tentatives sur ${total}`);
      }
      const delay = delays[attempt - 1];
      log(`Indy ne répond pas (${reason}), nouvelle tentative ${attempt + 1}/${attempts} dans ${formatDelay(delay)}`);
      await wait(delay);
    }
  }
}

/** GET sur l'API d'Indy depuis la page, avec les cookies du profil dédié. */
async function indyGet(page: IndyPage, path: string, retry: RetryOptions): Promise<unknown> {
  const short = path.split('?')[0];
  const res = await withRetry(`lecture de ${short}`, () => page.evaluate(async ({ p, timeout }) => {
    const r = await fetch(p, {
      method: 'GET', credentials: 'include', headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });
    return { status: r.status, text: await r.text() };
  }, { p: path, timeout: FETCH_TIMEOUT_MS }), retry);
  if (res.status === 401 || res.status === 403) throw new SessionExpired();
  if (res.status !== 200) throw new FormatError(`Indy a répondu ${res.status} sur ${short}`);
  try {
    return JSON.parse(res.text);
  } catch {
    throw new FormatError(`réponse Indy illisible sur ${short}`);
  }
}

async function readAll(page: IndyPage, path: string, key: string, retry: RetryOptions): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { items, total } = readPage(await indyGet(page, `${path}?start=${start}&limit=${PAGE_SIZE}`, retry), key);
    all.push(...items);
    if (items.length === 0 || all.length >= total) {
      if (all.length !== total) throw new FormatError(`liste « ${key} » incomplète : ${all.length} lus sur ${total}`);
      return all;
    }
  }
}

/** Lit factures et devis dans Indy depuis une page déjà ouverte sur le profil connecté. */
export async function readIndyFromPage(page: IndyPage, retry: RetryOptions = {}): Promise<{ invoices: InvoiceRow[]; quotes: QuoteRow[] }> {
  await withRetry('chargement de la page Indy',
    () => page.goto(`${INDY}/facturation/factures`, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS }), retry);
  await indyGet(page, '/api/end-user/me', retry);

  const rawInvoices = await readAll(page, '/api/facturation-invoices/documents/invoices', 'invoices', retry);
  const rawQuotes = await readAll(page, '/api/facturation-invoices/documents/quotations', 'quotations', retry);
  const totals = readTotals(
    await indyGet(page, '/api/facturation/invoices/kpis', retry),
    await indyGet(page, '/api/facturation/quotations/kpis', retry),
    await indyGet(page, '/api/facturation/invoices/count', retry),
    await indyGet(page, '/api/facturation/quotations/count', retry),
  );

  const invoices = rawInvoices.map(toInvoiceRow);
  const invoicedQuoteIds = new Set(rawInvoices
    .map(i => (i as Record<string, unknown>).fromQuotationId)
    .filter((id): id is string => typeof id === 'string'));
  const quotes = rawQuotes.map(q => toQuoteRow(q, invoicedQuoteIds));

  const numbers = [...invoices, ...quotes].map(r => r.number);
  const dup = numbers.find((n, i) => numbers.indexOf(n) !== i);
  if (dup) throw new FormatError(`numéro en double dans Indy : ${dup}`);

  const gaps = checkTotals(invoices, quotes, totals);
  if (gaps.length) throw new FormatError(`les totaux ne concordent pas avec Indy (${gaps.join(' ; ')})`);
  return { invoices, quotes };
}
