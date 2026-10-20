import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated, type Transaction, type Category } from './dashboard-utils';
import { loadSettings, effectiveSettings, type DeclarationSettings } from './declaration-utils';
import { computeProvisions, splitRevenue, urssafDueDate, todayIso } from './provision-utils';

/**
 * Trésorerie reconstituée, sans connexion bancaire :
 * - un compte = un solde de départ (current_balance) à une date (last_updated,
 *   à défaut la date de création du compte), solde en fin de journée ;
 * - solde reconstitué = soldes de départ + transactions importées APRÈS cette date ;
 * - provisions en cours = cotisations du trimestre en cours + celles du trimestre
 *   précédent tant que leur échéance n'est pas passée + TVA collectée depuis
 *   l'assujettissement (aucun reversement n'est encore suivi) ;
 * - disponible réel = solde reconstitué - provisions en cours.
 *
 * Les transactions ne sont pas rattachées à un compte : avec plusieurs comptes,
 * on part de la date de départ la plus récente et chaque transaction n'est
 * comptée qu'une fois.
 */

export interface TreasuryAccount {
  id: string;
  name: string;
  current_balance: number | null;
  last_updated: string | null;
  created_at: string;
}

export function accountStartDate(a: Pick<TreasuryAccount, 'last_updated' | 'created_at'>): string {
  return a.last_updated ?? a.created_at.slice(0, 10);
}

export interface ReconstitutedBalance {
  total: number;
  startingTotal: number;
  /** Date de départ commune (la plus récente des comptes), null sans compte. */
  fromDate: string | null;
  /** Mouvements importés après fromDate. */
  movements: number;
}

export function reconstituteBalance(accounts: TreasuryAccount[], transactions: Pick<Transaction, 'date' | 'amount'>[]): ReconstitutedBalance {
  if (accounts.length === 0) return { total: 0, startingTotal: 0, fromDate: null, movements: 0 };
  const fromDate = accounts.map(accountStartDate).sort().at(-1)!;
  const startingTotal = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const movements = transactions.filter(t => t.date > fromDate).reduce((s, t) => s + t.amount, 0);
  return { total: startingTotal + movements, startingTotal, fromDate, movements };
}

export interface PendingProvisions {
  current: { year: number; quarter: number; dueDate: string; amount: number };
  /** Trimestre précédent, seulement si son échéance n'est pas encore passée. */
  previous: { year: number; quarter: number; dueDate: string; amount: number } | null;
  tva: number;
  tvaSince: string | null;
  total: number;
}

const quarterRange = (year: number, quarter: number) => {
  const sm = (quarter - 1) * 3 + 1;
  const start = `${year}-${String(sm).padStart(2, '0')}-01`;
  const end = quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(sm + 3).padStart(2, '0')}-01`;
  return { start, end };
};

const previousQuarter = (year: number, quarter: number) =>
  quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };

export function pendingProvisions(
  transactions: Transaction[], categories: Category[],
  settingsFor: (year: number) => DeclarationSettings, today: string,
): PendingProvisions {
  const year = parseInt(today.slice(0, 4), 10);
  const quarter = Math.ceil(parseInt(today.slice(5, 7), 10) / 3);

  const cotisationsOf = (y: number, q: number) => {
    const { start, end } = quarterRange(y, q);
    const txs = transactions.filter(t => t.date >= start && t.date < end);
    return computeProvisions(txs, categories, settingsFor(y)).cotisations;
  };

  const current = { year, quarter, dueDate: urssafDueDate(year, quarter), amount: cotisationsOf(year, quarter) };
  const pq = previousQuarter(year, quarter);
  const prevDue = urssafDueDate(pq.year, pq.quarter);
  const previous = prevDue >= today ? { ...pq, dueDate: prevDue, amount: cotisationsOf(pq.year, pq.quarter) } : null;

  const settings = settingsFor(year);
  const tvaSince = settings.tvaStartDate || null;
  const tva = tvaSince
    ? splitRevenue(transactions.filter(t => t.date >= tvaSince && t.date <= today), categories, settings).tva
    : 0;

  return { current, previous, tva, tvaSince, total: current.amount + (previous?.amount ?? 0) + tva };
}

/** Début de la plage de transactions à charger pour la trésorerie. */
export function treasuryFetchStart(accounts: TreasuryAccount[], settings: DeclarationSettings, today: string): string {
  const year = parseInt(today.slice(0, 4), 10);
  const quarter = Math.ceil(parseInt(today.slice(5, 7), 10) / 3);
  const pq = previousQuarter(year, quarter);
  const candidates = [quarterRange(pq.year, pq.quarter).start];
  if (accounts.length > 0) candidates.push(accounts.map(accountStartDate).sort().at(-1)!);
  if (settings.tvaStartDate) candidates.push(settings.tvaStartDate);
  return candidates.sort()[0];
}

export interface TreasurySummary {
  accounts: TreasuryAccount[];
  balance: ReconstitutedBalance;
  provisions: PendingProvisions;
  disponible: number;
}

export async function fetchTreasurySummary(userId: string): Promise<TreasurySummary> {
  const today = todayIso();
  const stored = loadSettings(userId);
  const settingsFor = (y: number) => effectiveSettings(stored, y);

  const [accRes, catRes] = await Promise.all([
    supabase.from('bank_accounts').select('id, name, current_balance, last_updated, created_at').eq('user_id', userId).order('created_at'),
    supabase.from('categories').select('id, name, emoji, color, type').eq('user_id', userId),
  ]);
  const accounts = (accRes.data ?? []) as TreasuryAccount[];
  const categories = (catRes.data ?? []) as Category[];

  const start = treasuryFetchStart(accounts, settingsFor(parseInt(today.slice(0, 4), 10)), today);
  const transactions = await fetchPaginated(userId, 'id, date, label, amount, category_id, source, is_validated', start, '9999-12-31') as Transaction[];

  const balance = reconstituteBalance(accounts, transactions);
  const provisions = pendingProvisions(transactions, categories, settingsFor, today);
  return { accounts, balance, provisions, disponible: balance.total - provisions.total };
}
