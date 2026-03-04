import { supabase } from '@/integrations/supabase/client';

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

export interface MonthlyObjective {
  id: string;
  month: string;
  revenue_target: number | null;
  expense_budget: number | null;
}

export function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

export async function fetchDashboardData(userId: string, year: number, month: number) {
  const { start, end } = getMonthRange(year, month);

  // Previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prev = getMonthRange(prevYear, prevMonth);

  // 6 months ago for chart
  const sixMonthsAgo = new Date(year, month - 7, 1);
  const chartStart = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;

  const [txRes, prevTxRes, chartTxRes, catRes, objRes, objChartRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, date, label, amount, category_id, source, is_validated')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', end)
      .order('date', { ascending: false }),
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .gte('date', prev.start)
      .lt('date', prev.end),
    supabase
      .from('transactions')
      .select('date, amount')
      .eq('user_id', userId)
      .gte('date', chartStart)
      .lt('date', end),
    supabase
      .from('categories')
      .select('id, name, emoji, color, type')
      .eq('user_id', userId),
    supabase
      .from('monthly_objectives')
      .select('id, month, revenue_target, expense_budget')
      .eq('user_id', userId)
      .eq('month', start)
      .maybeSingle(),
    supabase
      .from('monthly_objectives')
      .select('month, revenue_target')
      .eq('user_id', userId)
      .gte('month', chartStart)
      .lt('month', end),
  ]);

  return {
    transactions: (txRes.data ?? []) as Transaction[],
    prevTransactions: (prevTxRes.data ?? []) as { amount: number }[],
    chartTransactions: (chartTxRes.data ?? []) as { date: string; amount: number }[],
    categories: (catRes.data ?? []) as Category[],
    objective: objRes.data as MonthlyObjective | null,
    chartObjectives: (objChartRes.data ?? []) as { month: string; revenue_target: number | null }[],
  };
}

export function computeVariation(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '—';
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export interface ChartMonth {
  label: string;
  month: string;
  revenue: number;
  expense: number;
  net: number;
  objectiveRevenue?: number;
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export function buildChartData(
  chartTransactions: { date: string; amount: number }[],
  chartObjectives: { month: string; revenue_target: number | null }[],
  year: number,
  month: number,
): ChartMonth[] {
  const months: ChartMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push({
      label: `${MONTH_LABELS[m - 1]} ${y}`,
      month: key,
      revenue: 0,
      expense: 0,
      net: 0,
    });
  }

  for (const tx of chartTransactions) {
    const key = tx.date.slice(0, 7); // YYYY-MM
    const entry = months.find((m) => m.month === key);
    if (!entry) continue;
    if (tx.amount > 0) entry.revenue += tx.amount;
    else entry.expense += Math.abs(tx.amount);
  }

  const objMap = new Map(chartObjectives.map((o) => [o.month.slice(0, 7), o.revenue_target]));

  for (const m of months) {
    m.net = m.revenue - m.expense;
    const obj = objMap.get(m.month);
    if (obj != null) m.objectiveRevenue = obj;
  }

  return months;
}

export interface TopCategory {
  categoryId: string;
  name: string;
  emoji: string;
  color: string;
  total: number;
}

export function computeTopCategories(
  transactions: Transaction[],
  categories: Category[],
  type: 'expense' | 'revenue',
  limit = 5,
): TopCategory[] {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    if (!tx.category_id) continue;
    const isRevenue = tx.amount > 0;
    if (type === 'revenue' && !isRevenue) continue;
    if (type === 'expense' && isRevenue) continue;
    const cur = totals.get(tx.category_id) ?? 0;
    totals.set(tx.category_id, cur + Math.abs(tx.amount));
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
