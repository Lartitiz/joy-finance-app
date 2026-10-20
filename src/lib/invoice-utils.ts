/**
 * Factures émises et « à encaisser ». Juste voir : aucun envoi, aucune relance.
 *
 * Statuts de la table invoices : draft, sent, paid, overdue, cancelled.
 * - payée : paid ;
 * - non payée (à encaisser) : sent ou overdue ; un brouillon ou une facture
 *   annulée n'est pas attendue ;
 * - en retard : non payée et date d'échéance passée. Sans échéance saisie, on
 *   prend 30 jours après l'émission (délai légal par défaut).
 */

export interface Invoice {
  id: string;
  number: string | null;
  client_name: string;
  amount: number;          // TTC
  date_issued: string;     // AAAA-MM-JJ
  date_due: string | null;
  status: string | null;
  paid_date: string | null;
}

export const isPaid = (inv: Pick<Invoice, 'status'>) => inv.status === 'paid';
export const isUnpaid = (inv: Pick<Invoice, 'status'>) => inv.status === 'sent' || inv.status === 'overdue';

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY).toISOString().slice(0, 10);
}

export function effectiveDueDate(inv: Pick<Invoice, 'date_due' | 'date_issued'>): string {
  return inv.date_due ?? addDays(inv.date_issued, 30);
}

/** Jours de retard à la date du jour (0 si pas encore échue ou payée). */
export function daysLate(inv: Invoice, today: string): number {
  if (!isUnpaid(inv)) return 0;
  return Math.max(0, Math.round((toUtc(today) - toUtc(effectiveDueDate(inv))) / DAY));
}

export interface Receivables {
  unpaidTotal: number;
  unpaidCount: number;
  lateTotal: number;
  lateCount: number;
  /** Retards de plus de 30 jours, du plus ancien au plus récent. */
  lateOver30: { invoice: Invoice; days: number }[];
}

export function computeReceivables(invoices: Invoice[], today: string): Receivables {
  const unpaid = invoices.filter(isUnpaid);
  const late = unpaid.filter(inv => daysLate(inv, today) > 0);
  return {
    unpaidTotal: unpaid.reduce((s, i) => s + i.amount, 0),
    unpaidCount: unpaid.length,
    lateTotal: late.reduce((s, i) => s + i.amount, 0),
    lateCount: late.length,
    lateOver30: late
      .map(invoice => ({ invoice, days: daysLate(invoice, today) }))
      .filter(l => l.days > 30)
      .sort((a, b) => b.days - a.days),
  };
}

/* ───── Import CSV (Indy ou autre logiciel) ───── */

export interface ParsedInvoice {
  number: string | null;
  client_name: string;
  amount: number;
  date_issued: string;
  date_due: string | null;
  paid: boolean;
}

export interface ParsedInvoiceFile {
  rows: ParsedInvoice[];
  /** Colonnes obligatoires introuvables (client, montant, date). */
  missing: string[];
  /** Lignes ignorées faute de client, de montant ou de date lisible. */
  skipped: number;
  /** Colonnes reconnues, pour la relecture. */
  columns: Partial<Record<keyof typeof MATCHERS, string>>;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Reconnaît les en-têtes courants (Indy, Stripe, export Excel…), sans dépendre de l'ordre. */
const MATCHERS = {
  number: (h: string) => /^(n°|no|num|numero|number|reference|ref)\b/.test(h) || /numero de facture|n° de facture|invoice number/.test(h),
  client: (h: string) => /client|customer|destinataire|raison sociale/.test(h),
  amount: (h: string) => /ttc/.test(h),
  amountFallback: (h: string) => /^(total|montant|amount|total amount)$/.test(h) || /montant total|total \(eur\)/.test(h),
  dateIssued: (h: string) => /^date$|emission|date de (la )?facture|date facture|date \(utc\)|issued|invoice date/.test(h) && !/echeance|due|paiement|payment/.test(h),
  dateDue: (h: string) => /echeance|due/.test(h),
  status: (h: string) => /statut|status|etat|^payee?$|^paid$|^reglee?$/.test(h),
};

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[€\s\u00a0\u202f]/g, '').replace(/EUR/i, '');
  if (!s) return null;
  // « 1.234,56 » ou « 1234,56 » → virgule décimale ; « 1,234.56 » ou « 1234.56 » → point décimal.
  const normalized = s.lastIndexOf(',') > s.lastIndexOf('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/,/g, '');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export function parsePaid(raw: string): boolean {
  const s = norm(raw);
  if (/non|impaye|unpaid|partiel|attente|retard|open|draft|brouillon|a encaisser/.test(s)) return false;
  return /pay|paid|regl|encaiss|true|oui/.test(s);
}

export function parseInvoicesCsv(text: string): ParsedInvoiceFile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  const empty: ParsedInvoiceFile = { rows: [], missing: ['client', 'montant TTC', "date d'émission"], skipped: 0, columns: {} };
  if (lines.length === 0) return empty;
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = splitCsvLine(lines[0], sep).map(norm);
  const raw = splitCsvLine(lines[0], sep);

  const find = (m: (h: string) => boolean) => headers.findIndex(m);
  const idx = {
    number: find(MATCHERS.number),
    client: find(MATCHERS.client),
    amount: find(MATCHERS.amount) >= 0 ? find(MATCHERS.amount) : find(MATCHERS.amountFallback),
    dateIssued: find(MATCHERS.dateIssued),
    dateDue: find(MATCHERS.dateDue),
    status: find(MATCHERS.status),
  };
  const columns: ParsedInvoiceFile['columns'] = {};
  if (idx.number >= 0) columns.number = raw[idx.number];
  if (idx.client >= 0) columns.client = raw[idx.client];
  if (idx.amount >= 0) columns.amount = raw[idx.amount];
  if (idx.dateIssued >= 0) columns.dateIssued = raw[idx.dateIssued];
  if (idx.dateDue >= 0) columns.dateDue = raw[idx.dateDue];
  if (idx.status >= 0) columns.status = raw[idx.status];

  const missing: string[] = [];
  if (idx.client < 0) missing.push('client');
  if (idx.amount < 0) missing.push('montant TTC');
  if (idx.dateIssued < 0) missing.push("date d'émission");
  if (missing.length > 0) return { rows: [], missing, skipped: 0, columns };

  const rows: ParsedInvoice[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, sep);
    if (cells.every(c => c === '')) continue; // ligne vide d'un export tableur
    const client = cells[idx.client] ?? '';
    const amount = parseAmount(cells[idx.amount] ?? '');
    const dateIssued = parseDate(cells[idx.dateIssued] ?? '');
    if (!client || amount === null || !dateIssued) { skipped++; continue; }
    rows.push({
      number: idx.number >= 0 ? (cells[idx.number] || null) : null,
      client_name: client,
      amount,
      date_issued: dateIssued,
      date_due: idx.dateDue >= 0 ? parseDate(cells[idx.dateDue] ?? '') : null,
      paid: idx.status >= 0 ? parsePaid(cells[idx.status] ?? '') : false,
    });
  }
  return { rows, missing, skipped, columns };
}
