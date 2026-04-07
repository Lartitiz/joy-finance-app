import { supabase } from '@/integrations/supabase/client';
import { computeAllQuarters, type Offer, type QuarterlyObjective } from './objectives-utils';

/* ───── Types ───── */

export type PeriodType = 'year' | 'quarter' | 'month';

export interface Transaction {
  id: string;
  date: string;
  label: string;
  amount: number;
  category_id: string | null;
  source: string | null;
  is_validated: boolean | null;
}

export interface Category {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  type: string;
}

export interface AnnualObjective {
  id: string;
  year: number;
  revenue_target: number;
}

export interface BankAccount {
  id: string;
  name: string;
  current_balance: number | null;
}

export interface TopCategory {
  categoryId: string;
  name: string;
  emoji: string;
  color: string;
  total: number;
}

export interface ChartMonth {
  label: string;
  monthNum: number; // 1-12
  revenue: number;
  expense: number;
  net: number;
  objectiveMonthly?: number;
  isCurrent: boolean;
  hasFutureData: boolean;
}

export interface QuarterBreakdown {
  quarter: number;
  realRevenue: number;
  objectiveRevenue: number;
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
export const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/* ───── Date range helpers ───── */

export function getDateRange(year: number, period: PeriodType, periodValue: number): { start: string; end: string } {
  if (period === 'year') {
    return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
  }
  if (period === 'quarter') {
    const sm = (periodValue - 1) * 3 + 1;
    const em = sm + 3;
    const ey = em > 12 ? year + 1 : year;
    const emAdj = em > 12 ? 1 : em;
    return {
      start: `${year}-${String(sm).padStart(2, '0')}-01`,
      end: `${ey}-${String(emAdj).padStart(2, '0')}-01`,
    };
  }
  // month
  const nm = periodValue === 12 ? 1 : periodValue + 1;
  const ny = periodValue === 12 ? year + 1 : year;
  return {
    start: `${year}-${String(periodValue).padStart(2, '0')}-01`,
    end: `${ny}-${String(nm).padStart(2, '0')}-01`,
  };
}

/* ───── Paginated transaction fetch ───── */

async function fetchPaginated(
  userId: string,
  select: string,
  dateStart: string,
  dateEnd: string,
  orderBy?: { column: string; ascending: boolean },
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let done = false;
  while (!done) {
    let q = supabase
      .from('transactions')
      .select(select)
      .eq('user_id', userId)
      .gte('date', dateStart)
      .lt('date', dateEnd)
      .range(from, from + PAGE - 1);
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending });
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data ?? []);
    done = (data?.length ?? 0) < PAGE;
    from += PAGE;
  }
  return all;
}

/* ───── Fetch all dashboard data ───── */

export interface ActivityKpi {
  year: number;
  month: number;
  discovery_calls: number;
  active_clients: number;
  prospects: number;
}

export interface ActivityTarget {
  quarter: number;
  discovery_calls: number;
  active_clients: number;
  prospects: number;
}

export interface DashboardData {
  transactions: Transaction[];
  prevTransactions: Transaction[];
  allYearTransactions: Transaction[];
  categories: Category[];
  annualObjective: AnnualObjective | null;
  quarterlyObjectives: QuarterlyObjective[];
  offers: Offer[];
  bankAccounts: BankAccount[];
  sparklineData: { date: string; amount: number }[];
  activityKpis: ActivityKpi[];
  activityTargets: ActivityTarget[];
}

export async function fetchDashboardData(
  userId: string,
  year: number,
  period: PeriodType,
  periodValue: number,
): Promise<DashboardData> {
  const { start, end } = getDateRange(year, period, periodValue);
  const prevRange = getDateRange(year - 1, period, periodValue);
  const yearRange = getDateRange(year, 'year', 0);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sparkStart = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;

  const txSelect = 'id, date, label, amount, category_id, source, is_validated';

  const [txData, prevTxData, allYearData, catRes, annObjRes, qObjRes, offRes, bankRes, sparkData, actKpiRes, actTargetRes] = await Promise.all([
    fetchPaginated(userId, txSelect, start, end, { column: 'date', ascending: false }),
    fetchPaginated(userId, txSelect, prevRange.start, prevRange.end),
    fetchPaginated(userId, txSelect, yearRange.start, yearRange.end),
    supabase.from('categories').select('id, name, emoji, color, type').eq('user_id', userId),
    supabase.from('annual_objectives').select('id, year, revenue_target')
      .eq('user_id', userId).eq('year', year).maybeSingle(),
    supabase.from('quarterly_objectives').select('id, offer_id, year, quarter, target_new_clients')
      .eq('user_id', userId).eq('year', year),
    supabase.from('offers').select('id, name, emoji, unit_price, billing_type, recurring_duration, is_active, sort_order')
      .eq('user_id', userId).eq('is_active', true),
    supabase.from('bank_accounts').select('id, name, current_balance').eq('user_id', userId),
    fetchPaginated(userId, 'date, amount', sparkStart, yearRange.end),
    supabase.from('monthly_activity_kpis').select('year, month, discovery_calls, active_clients, prospects')
      .eq('user_id', userId).eq('year', year),
    supabase.from('quarterly_activity_targets').select('quarter, discovery_calls, active_clients, prospects')
      .eq('user_id', userId).eq('year', year),
  ]);

  return {
    transactions: txData as Transaction[],
    prevTransactions: prevTxData as Transaction[],
    allYearTransactions: allYearData as Transaction[],
    categories: (catRes.data ?? []) as Category[],
    annualObjective: annObjRes.data as AnnualObjective | null,
    quarterlyObjectives: (qObjRes.data ?? []) as QuarterlyObjective[],
    offers: (offRes.data ?? []) as unknown as Offer[],
    bankAccounts: (bankRes.data ?? []) as BankAccount[],
    sparklineData: sparkData as { date: string; amount: number }[],
    activityKpis: (actKpiRes.data ?? []) as ActivityKpi[],
    activityTargets: (actTargetRes.data ?? []) as ActivityTarget[],
  };
}

/* ───── KPI computation ───── */

export function computeKpis(transactions: Transaction[], prevTransactions: Transaction[]) {
  const revenue = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = revenue - expense;
  const prevRevenue = prevTransactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevTransactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  return { revenue, expense, net, prevRevenue, prevExpense };
}

export function computeVariation(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '—';
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/* ───── Quarterly breakdown (real revenue) ───── */

export function computeQuarterlyBreakdown(
  allYearTransactions: Transaction[],
  year: number,
  quarterlyObjectives: QuarterlyObjective[],
  offers: Offer[],
): QuarterBreakdown[] {
  const quarters = computeAllQuarters(offers, quarterlyObjectives);
  const result: QuarterBreakdown[] = [];

  for (let q = 1; q <= 4; q++) {
    const sm = (q - 1) * 3 + 1;
    const months = [sm, sm + 1, sm + 2];
    const realRevenue = allYearTransactions
      .filter(t => {
        if (t.amount <= 0) return false;
        const m = parseInt(t.date.slice(5, 7), 10);
        return months.includes(m);
      })
      .reduce((s, t) => s + t.amount, 0);

    const qSummary = quarters.find(qs => qs.quarter === q);
    result.push({
      quarter: q,
      realRevenue,
      objectiveRevenue: qSummary?.totalProjected ?? 0,
    });
  }
  return result;
}

/* ───── Monthly chart data (12 months) ───── */

export function buildMonthlyChartData(
  allYearTransactions: Transaction[],
  year: number,
  quarterlyObjectives: QuarterlyObjective[],
  offers: Offer[],
): ChartMonth[] {
  const now = new Date();
  const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : 0;

  // Compute objective per quarter
  const quarters = computeAllQuarters(offers, quarterlyObjectives);
  const objByQuarter = new Map<number, number>();
  for (const q of quarters) {
    objByQuarter.set(q.quarter, q.totalProjected);
  }

  const months: ChartMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const q = Math.ceil(m / 3);
    const qObj = objByQuarter.get(q) ?? 0;
    const monthTxs = allYearTransactions.filter(t => parseInt(t.date.slice(5, 7), 10) === m);
    const revenue = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const hasFutureData = revenue === 0 && expense === 0 && (year > now.getFullYear() || (year === now.getFullYear() && m > currentMonth));

    months.push({
      label: MONTH_LABELS[m - 1],
      monthNum: m,
      revenue: hasFutureData ? 0 : revenue,
      expense: hasFutureData ? 0 : expense,
      net: hasFutureData ? 0 : revenue - expense,
      objectiveMonthly: qObj > 0 ? Math.round(qObj / 3) : undefined,
      isCurrent: m === currentMonth,
      hasFutureData,
    });
  }
  return months;
}

/* ───── Top categories ───── */

export function computeTopCategories(
  transactions: Transaction[],
  categories: Category[],
  type: 'expense' | 'revenue',
  limit = 5,
): TopCategory[] {
  const catMap = new Map(categories.map(c => [c.id, c]));
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    if (!tx.category_id) continue;
    const isRevenue = tx.amount > 0;
    if (type === 'revenue' && !isRevenue) continue;
    if (type === 'expense' && isRevenue) continue;
    totals.set(tx.category_id, (totals.get(tx.category_id) ?? 0) + Math.abs(tx.amount));
  }

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([catId, total]) => {
      const cat = catMap.get(catId);
      return {
        categoryId: catId,
        name: cat?.name ?? 'Inconnu',
        emoji: cat?.emoji ?? '',
        color: cat?.color ?? '95A5A6',
        total,
      };
    });
}

/* ───── Sparkline data (monthly net for last 6 months) ───── */

export function buildSparklineData(sparklineRaw: { date: string; amount: number }[]): { month: string; net: number }[] {
  const byMonth = new Map<string, number>();
  for (const tx of sparklineRaw) {
    const key = tx.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amount);
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, net]) => ({ month, net }));
}

/* ───── Objective target for the card ───── */

export function getObjectiveTarget(
  period: PeriodType,
  periodValue: number,
  annualObjective: AnnualObjective | null,
  quarterlyBreakdown: QuarterBreakdown[],
): number | null {
  if (period === 'year') {
    return annualObjective?.revenue_target ?? null;
  }
  if (period === 'quarter') {
    const q = quarterlyBreakdown.find(qb => qb.quarter === periodValue);
    return q && q.objectiveRevenue > 0 ? q.objectiveRevenue : null;
  }
  // month: approximate as quarter / 3
  const q = Math.ceil(periodValue / 3);
  const qb = quarterlyBreakdown.find(qb2 => qb2.quarter === q);
  return qb && qb.objectiveRevenue > 0 ? Math.round(qb.objectiveRevenue / 3) : null;
}
