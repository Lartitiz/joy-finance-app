/**
 * Devis (table quotes), recopiés chaque lundi depuis Indy. Juste voir : l'app
 * ne modifie jamais un devis, la synchronisation réécrirait tout le lundi.
 *
 * Statuts : pending (en attente de signature), signed (signé, pas encore
 * facturé), invoiced, refused, expired, cancelled.
 * - en attente : pending dont la date d'expiration n'est pas passée (ou sans
 *   date d'expiration) ; un devis qui expire aujourd'hui est encore valable ;
 * - expiré sans réponse : pending dont la date d'expiration est passée, ou
 *   marqué expired ;
 * - à facturer : signed.
 */

export interface Quote {
  id: string;
  number: string;
  client_name: string;
  title: string | null;
  amount: number;          // TTC
  date_issued: string;     // AAAA-MM-JJ
  date_expires: string | null;
  status: string;
}

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Jours écoulés depuis l'émission du devis. */
export function daysSinceIssued(q: Pick<Quote, 'date_issued'>, today: string): number {
  return Math.max(0, Math.round((toUtc(today) - toUtc(q.date_issued)) / DAY));
}

export const isExpired = (q: Pick<Quote, 'status' | 'date_expires'>, today: string) =>
  q.status === 'expired' || (q.status === 'pending' && q.date_expires !== null && q.date_expires < today);

export interface QuoteGroup {
  total: number;
  count: number;
  quotes: Quote[];
}

export interface PendingQuotes {
  /** En attente et encore valables, de celui qui expire le plus tôt au plus tard. */
  pending: QuoteGroup;
  /** Expirés sans réponse, du plus récent au plus ancien. */
  expired: QuoteGroup;
  /** Signés, pas encore facturés, du plus ancien au plus récent. */
  signed: QuoteGroup;
}

const group = (quotes: Quote[]): QuoteGroup => ({
  total: Math.round(quotes.reduce((s, q) => s + Number(q.amount), 0) * 100) / 100,
  count: quotes.length,
  quotes,
});

export function computePendingQuotes(quotes: Quote[], today: string): PendingQuotes {
  const pending = quotes
    .filter(q => q.status === 'pending' && !isExpired(q, today))
    .sort((a, b) => (a.date_expires ?? '9999').localeCompare(b.date_expires ?? '9999')
      || a.date_issued.localeCompare(b.date_issued));
  const expired = quotes
    .filter(q => isExpired(q, today))
    .sort((a, b) => (b.date_expires ?? b.date_issued).localeCompare(a.date_expires ?? a.date_issued));
  const signed = quotes
    .filter(q => q.status === 'signed')
    .sort((a, b) => a.date_issued.localeCompare(b.date_issued));
  return { pending: group(pending), expired: group(expired), signed: group(signed) };
}
