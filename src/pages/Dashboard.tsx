import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, TrendingDown, Scale, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Line, ComposedChart, CartesianGrid,
  Treemap,
} from 'recharts';
import {
  fetchDashboardData,
  computeVariation,
  formatEur,
  buildChartData,
  computeTopCategories,
  type Transaction,
  type Category,
  type MonthlyObjective,
  type ChartMonth,
  type TopCategory,
} from '@/lib/dashboard-utils';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default function Dashboard() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [objective, setObjective] = useState<MonthlyObjective | null>(null);
  const [chartData, setChartData] = useState<ChartMonth[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [expense, setExpense] = useState(0);
  const [prevRevenue, setPrevRevenue] = useState(0);
  const [prevExpense, setPrevExpense] = useState(0);
  const [topExpenses, setTopExpenses] = useState<TopCategory[]>([]);
  const [topRevenues, setTopRevenues] = useState<TopCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchDashboardData(user.id, year, month);

    setTransactions(data.transactions);
    setCategories(data.categories);
    setObjective(data.objective);

    const rev = data.transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const exp = data.transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    setRevenue(rev);
    setExpense(exp);

    const pRev = data.prevTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const pExp = data.prevTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    setPrevRevenue(pRev);
    setPrevExpense(pExp);

    setChartData(buildChartData(data.chartTransactions, data.chartObjectives, year, month));
    setTopExpenses(computeTopCategories(data.transactions, data.categories, 'expense'));
    setTopRevenues(computeTopCategories(data.transactions, data.categories, 'revenue'));

    setLoading(false);
  }, [user, year, month]);

  useEffect(() => { load(); }, [load]);

  const goMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const net = revenue - expense;
  const objPct = objective?.revenue_target ? Math.min(100, Math.round((revenue / objective.revenue_target) * 100)) : null;

  // Empty state
  if (!loading && transactions.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-accent">Tableau de bord</h1>
          <MonthSelector month={month} year={year} onNavigate={goMonth} />
        </div>
        <div className="bg-card rounded-[20px] shadow-soft p-16 flex flex-col items-center gap-4 text-center">
          <span className="text-6xl">📊</span>
          <h2 className="text-xl text-accent">Ton dashboard se remplira dès que tu importeras tes premières données</h2>
          <p className="text-muted-foreground max-w-md">Importe un relevé bancaire CSV ou Excel pour commencer à suivre tes finances.</p>
          <Button asChild size="lg" className="mt-2">
            <Link to="/import">Importer mes données →</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-accent">Tableau de bord</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-[20px] shadow-soft p-6 h-[140px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl text-accent">Tableau de bord</h1>
        <MonthSelector month={month} year={year} onNavigate={goMonth} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Revenus"
          value={formatEur(revenue)}
          variation={computeVariation(revenue, prevRevenue)}
          positive={revenue >= prevRevenue}
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
        />
        <KpiCard
          label="Dépenses"
          value={formatEur(expense)}
          variation={computeVariation(expense, prevExpense)}
          positive={expense <= prevExpense}
          icon={<TrendingDown className="h-5 w-5 text-destructive" />}
        />
        <KpiCard
          label="Résultat net"
          value={formatEur(net)}
          variation=""
          positive={net >= 0}
          icon={<Scale className="h-5 w-5 text-primary" />}
          valueColor={net >= 0 ? 'text-green-600' : 'text-destructive'}
        />
        {/* Objective card */}
        <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">vs Objectif</span>
            <Target className="h-5 w-5 text-primary" />
          </div>
          {objPct !== null ? (
            <>
              <p className="text-3xl font-mono">{objPct}%</p>
              <Progress value={objPct} className="h-2 [&>div]:bg-primary" />
            </>
          ) : (
            <Link to="/objectifs" className="text-sm text-primary hover:underline block pt-2">
              Pas d'objectif défini →
            </Link>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card rounded-[20px] shadow-soft p-6">
        <h2 className="text-lg text-accent mb-4">Revenus & Dépenses</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(340 20% 92%)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
              formatter={(value: number, name: string) => [formatEur(value), name === 'revenue' ? 'Revenus' : name === 'expense' ? 'Dépenses' : 'Net']}
              labelFormatter={(label: string) => label}
            />
            <Bar dataKey="revenue" fill="hsl(340 96% 61%)" radius={[6, 6, 0, 0]} name="revenue" />
            <Bar dataKey="expense" fill="#FFA7C6" radius={[6, 6, 0, 0]} name="expense" />
            <Line type="monotone" dataKey="net" stroke="hsl(0 0% 10%)" strokeWidth={2} dot={false} name="net" />
            {chartData.some((d) => d.objectiveRevenue) && (
              <ReferenceLine
                y={chartData.find((d) => d.objectiveRevenue)?.objectiveRevenue}
                stroke="#FFE561"
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{ value: 'Objectif', position: 'right', fill: '#b8a020', fontSize: 11 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Expense breakdown treemap */}
      <ExpenseTreemap transactions={transactions} categories={categories} expense={expense} />

      {/* Top categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TopCategoryCard title="Top dépenses" items={topExpenses} maxVal={topExpenses[0]?.total ?? 1} />
        <TopCategoryCard title="Top revenus" items={topRevenues} maxVal={topRevenues[0]?.total ?? 1} />
      </div>

      {/* Latest transactions */}
      <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg text-accent">Dernières transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-5 py-2.5 text-xs text-muted-foreground font-medium">Date</th>
                <th className="text-left px-5 py-2.5 text-xs text-muted-foreground font-medium">Libellé</th>
                <th className="text-left px-5 py-2.5 text-xs text-muted-foreground font-medium">Catégorie</th>
                <th className="text-right px-5 py-2.5 text-xs text-muted-foreground font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 10).map((tx) => {
                const cat = tx.category_id ? catMap.get(tx.category_id) : null;
                return (
                  <tr key={tx.id} className="border-t border-border">
                    <td className="px-5 py-2.5 font-mono text-xs">{tx.date}</td>
                    <td className="px-5 py-2.5 max-w-[240px] truncate">{tx.label}</td>
                    <td className="px-5 py-2.5 text-xs">
                      {cat ? (
                        <span>{cat.emoji} {cat.name}</span>
                      ) : (
                        <span className="text-muted-foreground">Non catégorisé</span>
                      )}
                    </td>
                    <td className={`px-5 py-2.5 text-right font-mono text-xs ${tx.amount >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {tx.amount >= 0 ? '+' : ''}{formatEur(tx.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function MonthSelector({ month, year, onNavigate }: { month: number; year: number; onNavigate: (dir: -1 | 1) => void }) {
  return (
    <div className="flex items-center gap-2 bg-card rounded-full shadow-soft px-1 py-1">
      <button onClick={() => onNavigate(-1)} className="p-2 rounded-full hover:bg-muted transition-colors">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium min-w-[140px] text-center">
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <button onClick={() => onNavigate(1)} className="p-2 rounded-full hover:bg-muted transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function KpiCard({
  label, value, variation, positive, icon, valueColor,
}: {
  label: string; value: string; variation: string; positive: boolean; icon: React.ReactNode; valueColor?: string;
}) {
  return (
    <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className={`text-2xl lg:text-3xl font-mono ${valueColor ?? ''}`}>{value}</p>
      {variation && (
        <span className={`text-xs font-mono ${positive ? 'text-green-600' : 'text-destructive'}`}>
          {variation} vs mois précédent
        </span>
      )}
    </div>
  );
}

function TopCategoryCard({ title, items, maxVal }: { title: string; items: TopCategory[]; maxVal: number }) {
  if (items.length === 0) {
    return (
      <div className="bg-card rounded-[20px] shadow-soft p-6 flex flex-col items-center justify-center gap-2 min-h-[200px]">
        <p className="text-muted-foreground text-sm">{title}</p>
        <Link to="/import" className="text-sm text-primary hover:underline">
          Importe tes données pour voir tes stats →
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-4">
      <h3 className="text-sm text-accent font-medium">{title}</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.categoryId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>
                {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
                {item.name}
              </span>
              <span className="font-mono text-xs">{formatEur(item.total)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(4, (item.total / maxVal) * 100)}%`,
                  backgroundColor: `#${item.color}`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Treemap custom content ---- */

interface TreemapItem {
  name: string;
  emoji: string;
  color: string;
  value: number;
  pct: number;
}

function TreemapContent(props: any) {
  const { x, y, width, height, name, emoji, pct, color, value } = props;
  if (width < 4 || height < 4) return null;

  const isSmall = width < 90 || height < 50;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        style={{ fill: `#${color}`, stroke: '#fff', strokeWidth: 2, opacity: 0.85 }}
      />
      {isSmall ? (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fontSize={16}>
          {emoji}
        </text>
      ) : (
        <>
          <text x={x + width / 2} y={y + height / 2 - 14} textAnchor="middle" dominantBaseline="central" fontSize={15}>
            {emoji}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#fff" fontWeight={500}>
            {name.length > width / 7 ? name.slice(0, Math.floor(width / 7)) + '…' : name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 20} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="rgba(255,255,255,0.8)" fontFamily="IBM Plex Mono, monospace">
            {formatEur(value)} · {pct}%
          </text>
        </>
      )}
    </g>
  );
}

function ExpenseTreemap({ transactions, categories, expense }: { transactions: Transaction[]; categories: Category[]; expense: number }) {
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // Aggregate expenses by category
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.amount >= 0 || !tx.category_id) continue;
    const cur = totals.get(tx.category_id) ?? 0;
    totals.set(tx.category_id, cur + Math.abs(tx.amount));
  }

  const items: TreemapItem[] = Array.from(totals.entries())
    .map(([catId, total]) => {
      const cat = catMap.get(catId);
      return {
        name: cat?.name ?? 'Autre',
        emoji: cat?.emoji ?? '❓',
        color: cat?.color ?? '95A5A6',
        value: total,
        pct: expense > 0 ? Math.round((total / expense) * 100) : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  if (items.length === 0) {
    return (
      <div className="bg-card rounded-[20px] shadow-soft p-8 text-center">
        <h2 className="text-lg text-accent mb-2">Où part ton argent ce mois-ci</h2>
        <Link to="/categories" className="text-sm text-primary hover:underline">
          Catégorise tes transactions pour voir la répartition →
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4">
      <h2 className="text-lg text-accent">Où part ton argent ce mois-ci</h2>

      <ResponsiveContainer width="100%" height={260}>
        <Treemap
          data={items}
          dataKey="value"
          aspectRatio={4 / 3}
          content={<TreemapContent />}
        />
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {items.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: `#${item.color}` }} />
            <span>{item.emoji} {item.name}</span>
            <span className="font-mono text-muted-foreground">{formatEur(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
