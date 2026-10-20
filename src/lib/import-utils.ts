import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type RawRow = Record<string, string>;

export function parseFile(file: File): Promise<{ headers: string[]; rows: RawRow[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          const headers = results.meta.fields ?? [];
          resolve({ headers, rows: results.data as RawRow[] });
        },
        error(err: Error) {
          reject(err);
        },
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' });
          const headers = json.length > 0 ? Object.keys(json[0]) : [];
          resolve({ headers, rows: json.map(r => {
            const row: RawRow = {};
            for (const k of headers) row[k] = String(r[k] ?? '');
            return row;
          }) });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsArrayBuffer(file);
    });
  }

  return Promise.reject(new Error('Format non supporté. Utilisez .csv, .xlsx ou .xls'));
}

export type ColumnMapping = 'date' | 'label' | 'amount_single' | 'amount_credit' | 'amount_debit' | 'ignore';

const DATE_KEYWORDS = ['date', 'jour', 'day', 'valeur', 'opération'];
// La date d'opération passe avant la date de valeur : deux exports du même
// compte doivent donner la même date à un mouvement, sinon il échappe à
// l'anti-doublon et peut changer de trimestre (31/03 contre 01/04).
const VALUE_DATE_KEYWORDS = ['valeur', 'value'];
const LABEL_KEYWORDS = ['libellé', 'libelle', 'label', 'description', 'intitulé', 'intitule', 'designation', 'communication', 'référence', 'reference'];
const CREDIT_KEYWORDS = ['crédit', 'credit', 'encaissement', 'recette'];
const DEBIT_KEYWORDS = ['débit', 'debit', 'décaissement'];
const AMOUNT_KEYWORDS = ['montant', 'amount', 'somme', 'valeur'];

export function autoMapColumns(headers: string[]): Record<string, ColumnMapping> {
  const mapping: Record<string, ColumnMapping> = {};
  const lower = headers.map(h => h.toLowerCase().trim());

  const isDateHeader = (h: string) => DATE_KEYWORDS.some(k => h.includes(k));
  const isValueDate = (h: string) => VALUE_DATE_KEYWORDS.some(k => h.includes(k));
  const dateIndexes = lower.map((h, i) => (isDateHeader(h) ? i : -1)).filter(i => i >= 0);
  const dateIndex = dateIndexes.find(i => !isValueDate(lower[i])) ?? dateIndexes[0] ?? -1;

  // Libellé : la colonne qui correspond au mot-clé le plus prioritaire
  // (« Libellé » avant « Référence »), quel que soit l'ordre des colonnes.
  const labelIndex = (() => {
    for (const k of LABEL_KEYWORDS) {
      const i = lower.findIndex((h, j) => !dateIndexes.includes(j) && h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  })();

  let hasCredit = false, hasDebit = false, hasAmount = false;

  lower.forEach((h, i) => {
    const header = headers[i];
    if (i === dateIndex) {
      mapping[header] = 'date';
    } else if (dateIndexes.includes(i)) {
      // autre colonne de date (ex. date de valeur) : laissée de côté
    } else if (i === labelIndex) {
      mapping[header] = 'label';
    } else if (LABEL_KEYWORDS.some(k => h.includes(k))) {
      // autre colonne de libellé (ex. référence) : laissée de côté
    } else if (!hasCredit && CREDIT_KEYWORDS.some(k => h.includes(k))) {
      mapping[header] = 'amount_credit';
      hasCredit = true;
    } else if (!hasDebit && DEBIT_KEYWORDS.some(k => h.includes(k))) {
      mapping[header] = 'amount_debit';
      hasDebit = true;
    } else if (!hasAmount && !hasCredit && !hasDebit && AMOUNT_KEYWORDS.some(k => h.includes(k))) {
      mapping[header] = 'amount_single';
      hasAmount = true;
    }
  });

  // Fill remaining with ignore
  for (const h of headers) {
    if (!(h in mapping)) mapping[h] = 'ignore';
  }

  return mapping;
}

const DATE_FORMATS = [
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/,
  // YYYY-MM-DD, YYYY/MM/DD
  /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/,
];

export function parseDate(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) return null;

  // Try DD/MM/YYYY
  const match1 = trimmed.match(DATE_FORMATS[0]);
  if (match1) {
    const [, d, m, y] = match1;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD
  const match2 = trimmed.match(DATE_FORMATS[1]);
  if (match2) {
    const [, y, m, d] = match2;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Date suivie d'une heure (« 31/03/2026 23:30 », « 2026-03-31T23:30:00Z ») :
  // on garde le jour écrit, sans passer par l'UTC qui le décalerait.
  const withTime = trimmed.match(/^(\S+)[ T]\d{1,2}:\d{2}/);
  if (withTime) return parseDate(withTime[1]);

  // Date Excel stockée en nombre de jours depuis le 30/12/1899 (ex. 46113).
  if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    const serial = Math.floor(Number(trimmed));
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return d.toISOString().split('T')[0];
  }

  // Fallback: try native parsing (jour local, pas UTC)
  const native = new Date(trimmed);
  if (!isNaN(native.getTime()) && native.getFullYear() >= 1900 && native.getFullYear() < 2200) {
    const y = native.getFullYear();
    const m = String(native.getMonth() + 1).padStart(2, '0');
    const d = String(native.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

export function parseAmount(val: string): number | null {
  if (!val || !val.trim()) return null;
  // Remove spaces, replace comma with dot
  const cleaned = val.trim().replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export interface ParsedTransaction {
  date: string;
  label: string;
  amount: number;
}

/**
 * Libellé ramené à sa forme comparable : sans accents, en minuscules, sans
 * ponctuation, et réduit à la dernière partie quand il a été enrichi avec
 * « | ». Ainsi « Vir Sepa Stripe | VIR SEPA STRIPE » et « VIR SEPA STRIPE »
 * désignent le même mouvement (cause des doublons du T1 2026).
 */
export function normalizeLabel(label: string): string {
  const parts = String(label ?? '').split(/\s\|\s/);
  const last = parts[parts.length - 1];
  return last
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function amountKey(amount: number | string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? String(Math.round(n * 100)) : String(amount);
}

/**
 * Clé de dédoublonnage : date, montant en centimes (le signe donne le sens)
 * et libellé normalisé. Reconnaît le même mouvement même si la banque ou un
 * autre export a changé la mise en forme du libellé.
 */
export function dedupKey(t: { date: string; label: string; amount: number | string }): string {
  return `${t.date}|${amountKey(t.amount)}|${normalizeLabel(t.label)}`;
}

/** Clé large : même date et même montant, quel que soit le libellé. */
export function looseKey(t: { date: string; amount: number | string }): string {
  return `${t.date}|${amountKey(t.amount)}`;
}

type ExistingTx = { date: string; label: string; amount: number | string };

/**
 * Sépare les transactions entrantes en trois groupes, en tenant compte du
 * NOMBRE d'occurrences déjà présentes (une 2e transaction légitimement
 * identique n'est pas perdue) :
 * - dupes : même date, même montant, même libellé normalisé ;
 * - probables : même date et même montant qu'une ligne déjà en base, mais
 *   libellé différent (souvent un autre export du même mouvement) ;
 * - fresh : le reste.
 */
export function splitDuplicates(
  incoming: ParsedTransaction[],
  existing: ExistingTx[],
): { fresh: ParsedTransaction[]; dupes: ParsedTransaction[]; probables: ParsedTransaction[] } {
  const remaining = new Map<string, number>();
  for (const e of existing) {
    const k = dedupKey(e);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  const dupes: ParsedTransaction[] = [];
  const rest: ParsedTransaction[] = [];
  for (const t of incoming) {
    const k = dedupKey(t);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      dupes.push(t);
    } else {
      rest.push(t);
    }
  }

  // Lignes en base restées sans correspondance exacte, comptées par date + montant.
  const looseLeft = new Map<string, number>();
  for (const e of existing) {
    const k = dedupKey(e);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      const lk = looseKey(e);
      looseLeft.set(lk, (looseLeft.get(lk) ?? 0) + 1);
    }
  }
  const fresh: ParsedTransaction[] = [];
  const probables: ParsedTransaction[] = [];
  for (const t of rest) {
    const lk = looseKey(t);
    const left = looseLeft.get(lk) ?? 0;
    if (left > 0) {
      looseLeft.set(lk, left - 1);
      probables.push(t);
    } else {
      fresh.push(t);
    }
  }
  return { fresh, dupes, probables };
}

/** Plage de dates couverte par un fichier, pour ne relire que cette période. */
export function dateSpan(txns: ParsedTransaction[]): { start: string; end: string } | null {
  if (txns.length === 0) return null;
  let start = txns[0].date, end = txns[0].date;
  for (const t of txns) {
    if (t.date < start) start = t.date;
    if (t.date > end) end = t.date;
  }
  return { start, end };
}

export function applyMapping(
  rows: RawRow[],
  mapping: Record<string, ColumnMapping>
): { transactions: ParsedTransaction[]; errors: string[] } {
  const dateCol = Object.entries(mapping).find(([, v]) => v === 'date')?.[0];
  const labelCol = Object.entries(mapping).find(([, v]) => v === 'label')?.[0];
  const amountSingleCol = Object.entries(mapping).find(([, v]) => v === 'amount_single')?.[0];
  const creditCol = Object.entries(mapping).find(([, v]) => v === 'amount_credit')?.[0];
  const debitCol = Object.entries(mapping).find(([, v]) => v === 'amount_debit')?.[0];

  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const lineNum = i + 2; // header = line 1

    // Date
    const rawDate = dateCol ? row[dateCol] : '';
    const date = parseDate(rawDate);
    if (!date) {
      errors.push(`Ligne ${lineNum} : date invalide "${rawDate}"`);
      return;
    }

    // Label
    const label = labelCol ? row[labelCol]?.trim() : '';
    if (!label) {
      errors.push(`Ligne ${lineNum} : libellé vide`);
      return;
    }

    // Amount
    let amount: number | null = null;
    if (amountSingleCol) {
      amount = parseAmount(row[amountSingleCol]);
    } else if (creditCol || debitCol) {
      const credit = creditCol ? parseAmount(row[creditCol]) : null;
      const debit = debitCol ? parseAmount(row[debitCol]) : null;
      if (credit && credit !== 0) {
        amount = Math.abs(credit);
      } else if (debit && debit !== 0) {
        amount = -Math.abs(debit);
      } else if (credit === 0 && debit === 0) {
        amount = 0;
      }
    }

    if (amount === null) {
      errors.push(`Ligne ${lineNum} : montant invalide`);
      return;
    }

    transactions.push({ date, label, amount });
  });

  return { transactions, errors };
}
