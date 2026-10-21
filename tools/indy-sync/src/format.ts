// Lecture stricte des réponses de l'API interne d'Indy et conversion vers les
// lignes de l'app. Aucun accès réseau ici : tout se teste sans Indy.
// Règle : au moindre champ inattendu, on lève une FormatError (message clair)
// plutôt que d'envoyer une donnée douteuse à l'app.

export class FormatError extends Error {}

export interface InvoiceRow {
  number: string;
  client_name: string;
  description: string | null;
  amount: number;          // TTC en euros (négatif pour un avoir)
  date_issued: string;     // AAAA-MM-JJ
  date_due: string | null;
  status: 'sent' | 'paid' | 'cancelled';
}

export interface QuoteRow {
  number: string;
  client_name: string;
  title: string | null;
  amount: number;
  date_issued: string;
  date_expires: string | null;
  status: 'pending' | 'signed' | 'invoiced' | 'refused' | 'expired' | 'cancelled';
}

/** Totaux affichés par Indy, en centimes, pour contrôler la lecture. */
export interface IndyTotals {
  invoicesCount: number;
  quotesCount: number;
  invoicedTTC: number;
  waitingTTC: number;
  quotesTTC: number;
  quotesPendingTTC: number;
}

type Obj = Record<string, unknown>;

const INVOICE_STATUS: Record<string, InvoiceRow['status']> = {
  PENDING: 'sent',
  PAID: 'paid',
  CANCELLED: 'cancelled',
};
const INVOICE_TYPES = new Set(['INVOICE', 'CREDIT_NOTE', 'ACOMPTE', 'SOLDE']);
const QUOTE_STATUS: Record<string, QuoteRow['status'] | 'accepted'> = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REFUSED: 'refused',
  DECLINED: 'refused',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function field<T>(o: Obj, key: string, ok: (v: unknown) => v is T, where: string): T {
  const v = o[key];
  if (!ok(v)) throw new FormatError(`${where} : champ « ${key} » absent ou inattendu (${JSON.stringify(v)})`);
  return v;
}
const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const cents = (v: unknown): v is number => Number.isInteger(v);

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Nom du client : raison sociale, sinon prénom + nom. */
export function clientName(doc: Obj, where: string): string {
  const c = doc.client;
  if (!isObj(c)) throw new FormatError(`${where} : client absent`);
  const name = typeof c.companyName === 'string' && c.companyName.trim()
    ? c.companyName
    : [c.firstName, c.lastName].filter(s => typeof s === 'string' && s.trim()).join(' ');
  if (!name.trim()) throw new FormatError(`${where} : client sans nom`);
  return name.replace(/\s+/g, ' ').trim();
}

export function toInvoiceRow(raw: unknown): InvoiceRow {
  if (!isObj(raw)) throw new FormatError('facture : objet attendu');
  const number = field(raw, 'fullNumber', str, 'facture');
  const where = `facture ${number}`;
  const status = field(raw, 'status', str, where);
  if (!(status in INVOICE_STATUS)) throw new FormatError(`${where} : statut Indy inconnu « ${status} »`);
  const type = field(raw, 'type', str, where);
  if (!INVOICE_TYPES.has(type)) throw new FormatError(`${where} : type Indy inconnu « ${type} »`);
  const date = field(raw, 'date', isDate, where);
  const ttc = field(raw, 'totalTTC', cents, where);
  const delay = raw.delaiDePaiementDays;
  if (delay !== null && delay !== undefined && !Number.isInteger(delay)) {
    throw new FormatError(`${where} : délai de paiement inattendu (${JSON.stringify(delay)})`);
  }
  return {
    number,
    client_name: clientName(raw, where),
    description: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
    amount: ttc / 100,
    date_issued: date,
    date_due: Number.isInteger(delay) ? addDays(date, delay as number) : null,
    status: INVOICE_STATUS[status],
  };
}

/**
 * Un devis accepté devient « facturé » dès qu'une facture (ou un brouillon de
 * facture) en est issue, sinon il reste « signé ».
 */
export function toQuoteRow(raw: unknown, invoicedQuoteIds: Set<string>): QuoteRow {
  if (!isObj(raw)) throw new FormatError('devis : objet attendu');
  const number = field(raw, 'fullNumber', str, 'devis');
  const where = `devis ${number}`;
  const id = field(raw, 'id', str, where);
  const status = field(raw, 'status', str, where);
  const mapped = QUOTE_STATUS[status];
  if (!mapped) throw new FormatError(`${where} : statut Indy inconnu « ${status} »`);
  const drafts = raw.invoiceDraftIds;
  if (drafts !== undefined && drafts !== null && !Array.isArray(drafts)) {
    throw new FormatError(`${where} : liste des factures liées inattendue`);
  }
  const invoiced = invoicedQuoteIds.has(id) || (Array.isArray(drafts) && drafts.length > 0);
  const expires = raw.expirationDate;
  if (expires !== null && expires !== undefined && !isDate(expires)) {
    throw new FormatError(`${where} : date d'expiration inattendue (${JSON.stringify(expires)})`);
  }
  return {
    number,
    client_name: clientName(raw, where),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
    amount: field(raw, 'totalTTC', cents, where) / 100,
    date_issued: field(raw, 'issuanceDate', isDate, where),
    date_expires: isDate(expires) ? expires : null,
    status: mapped === 'accepted' ? (invoiced ? 'invoiced' : 'signed') : mapped,
  };
}

/** Lit une page de liste : { <clé>: [...], pagination: { total } }. */
export function readPage(body: unknown, key: string): { items: unknown[]; total: number } {
  if (!isObj(body) || !Array.isArray(body[key]) || !isObj(body.pagination)
      || !Number.isInteger(body.pagination.total)) {
    throw new FormatError(`liste « ${key} » : structure de réponse inattendue`);
  }
  return { items: body[key] as unknown[], total: body.pagination.total as number };
}

/** Lit les totaux d'Indy (centimes) dans les réponses kpis et count. */
export function readTotals(invKpis: unknown, quoteKpis: unknown, invCount: unknown, quoteCount: unknown): IndyTotals {
  const ttc = (o: unknown, path: string[]): number => {
    let cur: unknown = o;
    for (const k of path) cur = isObj(cur) ? cur[k] : undefined;
    const v = isObj(cur) ? cur.totalTTCInCents : undefined;
    if (!Number.isInteger(v)) throw new FormatError(`totaux Indy : « ${path.join('.')} » absent`);
    return v as number;
  };
  const count = (o: unknown, what: string): number => {
    if (!isObj(o) || !Number.isInteger(o.count)) throw new FormatError(`totaux Indy : nombre de ${what} absent`);
    return o.count as number;
  };
  return {
    invoicesCount: count(invCount, 'factures'),
    quotesCount: count(quoteCount, 'devis'),
    invoicedTTC: ttc(invKpis, ['kpis', 'totalInvoicedAmount']),
    waitingTTC: ttc(invKpis, ['kpis', 'waitingForPaymentAmount']),
    quotesTTC: ttc(quoteKpis, ['kpis', 'totalQuotationsAmount']),
    quotesPendingTTC: ttc(quoteKpis, ['kpis', 'totalQuotationsPendingAmount']),
  };
}

/**
 * Compare ce qu'on a lu aux totaux affichés par Indy. Renvoie la liste des
 * écarts (vide si tout concorde). Un écart = lecture incomplète ou format changé.
 */
export function checkTotals(invoices: InvoiceRow[], quotes: QuoteRow[], t: IndyTotals): string[] {
  const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((s, r) => s + r.amount * 100, 0));
  const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',') + ' €';
  const gaps: string[] = [];
  const cmp = (label: string, read: number, indy: number, money = true) => {
    if (read !== indy) gaps.push(`${label} : lu ${money ? eur(read) : read}, Indy affiche ${money ? eur(indy) : indy}`);
  };
  cmp('nombre de factures', invoices.length, t.invoicesCount, false);
  cmp('nombre de devis', quotes.length, t.quotesCount, false);
  cmp('total facturé', sum(invoices.filter(i => i.status !== 'cancelled')), t.invoicedTTC);
  cmp('factures non payées', sum(invoices.filter(i => i.status === 'sent')), t.waitingTTC);
  cmp('total des devis', sum(quotes), t.quotesTTC);
  cmp('devis en attente', sum(quotes.filter(q => q.status === 'pending')), t.quotesPendingTTC);
  return gaps;
}
