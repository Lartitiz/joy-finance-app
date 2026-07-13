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
const LABEL_KEYWORDS = ['libellé', 'libelle', 'label', 'description', 'intitulé', 'intitule', 'designation', 'communication', 'référence', 'reference'];
const CREDIT_KEYWORDS = ['crédit', 'credit', 'encaissement', 'recette'];
const DEBIT_KEYWORDS = ['débit', 'debit', 'décaissement'];
const AMOUNT_KEYWORDS = ['montant', 'amount', 'somme', 'valeur'];

export function autoMapColumns(headers: string[]): Record<string, ColumnMapping> {
  const mapping: Record<string, ColumnMapping> = {};
  const lower = headers.map(h => h.toLowerCase().trim());

  let hasDate = false, hasLabel = false, hasCredit = false, hasDebit = false, hasAmount = false;

  lower.forEach((h, i) => {
    const header = headers[i];
    if (!hasDate && DATE_KEYWORDS.some(k => h.includes(k))) {
      mapping[header] = 'date';
      hasDate = true;
    } else if (!hasLabel && LABEL_KEYWORDS.some(k => h.includes(k))) {
      mapping[header] = 'label';
      hasLabel = true;
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

  // Fallback: try native parsing
  const native = new Date(trimmed);
  if (!isNaN(native.getTime())) {
    return native.toISOString().split('T')[0];
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
 * Clé de dédoublonnage robuste : on normalise le libellé (espaces multiples,
 * casse) et le montant (2 décimales fixes) pour que le même mouvement soit
 * reconnu même si la banque a légèrement changé sa mise en forme, ou si la base
 * renvoie le montant en chaîne plutôt qu'en nombre.
 */
export function dedupKey(t: { date: string; label: string; amount: number | string }): string {
  const label = String(t.label ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const amount = Number(t.amount);
  const amountKey = Number.isFinite(amount) ? amount.toFixed(2) : String(t.amount);
  return `${t.date}|${label}|${amountKey}`;
}

/**
 * Sépare les transactions entrantes en "nouvelles" et "doublons" en tenant
 * compte du NOMBRE d'occurrences déjà présentes. Si la base contient déjà 1
 * exemplaire d'un mouvement et que le fichier en apporte 2, un seul est
 * considéré comme doublon — le second (légitime) est bien importé.
 */
export function splitDuplicates(
  incoming: ParsedTransaction[],
  existing: { date: string; label: string; amount: number | string }[],
): { fresh: ParsedTransaction[]; dupes: ParsedTransaction[] } {
  const remaining = new Map<string, number>();
  for (const e of existing) {
    const k = dedupKey(e);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  const fresh: ParsedTransaction[] = [];
  const dupes: ParsedTransaction[] = [];
  for (const t of incoming) {
    const k = dedupKey(t);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      dupes.push(t);
    } else {
      fresh.push(t);
    }
  }
  return { fresh, dupes };
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
