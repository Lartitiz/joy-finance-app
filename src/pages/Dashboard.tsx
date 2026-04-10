import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, TrendingDown, Scale, Target, ChevronLeft, ChevronRight, Phone, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, CartesianGrid,
  Treemap, LineChart, ReferenceLine, Cell, ReferenceArea,
} from 'recharts';
import {
  fetchDashboardData, computeKpis, computeVariation, formatEur,
  buildMonthlyChartData, computeQuarterlyBreakdown, computeTopCategories,
  buildSparklineData, getObjectiveTarget, MONTH_NAMES,
  type PeriodType, type Transaction, type Category, type ChartMonth,
  type TopCategory, type QuarterBreakdown, type DashboardData,
  type ActivityKpi, type ActivityTarget,
} from '@/lib/dashboard-utils';

export default function Dashboard() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState<PeriodType>('year');
  const [quarterVal, setQuarterVal] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [monthVal, setMonthVal] = useState(now.getMonth() + 1);

  const periodValue = period === 'quarter' ? quarterVal : period === 'month' ? monthVal : 0;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const d = await fetchDashboardData(user.id, year, period, periodValue);
    setData(d);
    setLoading(false);
  }, [user, year, period, periodValue]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-accent">Tableau de bord</h1>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-[20px] shadow-soft p-6 h-[140px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (data.allYearTransactions.length === 0 && data.transactions.length === 0) {
    return (
      <div className="space-y-8">
        <Header year={year} setYear={setYear} period={period} setPeriod={setPeriod}
          quarterVal={quarterVal} setQuarterVal={setQuarterVal}
          monthVal={monthVal} setMonthVal={setMonthVal} />
        <div className="bg-card rounded-[20px] shadow-soft p-16 flex flex-col items-center gap-4 text-center">
          <span className="text-6xl">📊</span>
          <h2 className="text-xl text-accent">Ton tableau de bord est prêt à se remplir !</h2>
          <p className="text-muted-foreground max-w-md">Importe un relevé bancaire pour commencer à suivre tes finances.</p>
          <Button asChild size="lg" className="mt-2">
            <Link to="/import">Importer mes données →</Link>
          </Button>
        </div>
      </div>
    );
  }

  const kpis = computeKpis(data.transactions, data.prevTransactions, data.categories);
  const quarterlyBreakdown = computeQuarterlyBreakdown(data.allYearTransactions, year, data.quarterlyObjectives, data.offers, data.categories);
  const chartData = buildMonthlyChartData(data.allYearTransactions, year, data.quarterlyObjectives, data.offers, data.categories);
  const objTarget = getObjectiveTarget(period, periodValue, data.annualObjective, quarterlyBreakdown);
  const objPct = objTarget ? Math.min(100, Math.round((kpis.revenue / objTarget) * 100)) : null;
  const catMap = new Map(data.categories.map(c => [c.id, c]));
  const topRevenues = computeTopCategories(data.transactions, data.categories, 'revenue', 10);
  const topExpenses = computeTopCategories(data.transactions, data.categories, 'expense', 10);
  const totalBalance = data.bankAccounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const sparkline = buildSparklineData(data.sparklineData);

  const yearTotalRevenue = data.allYearTransactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const annualTarget = data.annualObjective?.revenue_target ?? 0;
  const annualPct = annualTarget > 0 ? Math.min(100, Math.round((yearTotalRevenue / annualTarget) * 100)) : 0;

  // Activity KPI aggregation
  const activityAgg = computeActivityAgg(data.activityKpis, data.activityTargets, period, periodValue);

  const periodLabel = period === 'year' ? `${year}` : period === 'quarter' ? `T${quarterVal} ${year}` : `${MONTH_NAMES[monthVal - 1]} ${year}`;

  return (
    <div className="space-y-8">
      <Header year={year} setYear={setYear} period={period} setPeriod={setPeriod}
        quarterVal={quarterVal} setQuarterVal={setQuarterVal}
        monthVal={monthVal} setMonthVal={setMonthVal} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="CA cumulé" value={formatEur(kpis.revenue)}
          variation={`${computeVariation(kpis.revenue, kpis.prevRevenue)} vs ${year - 1}`}
          positive={kpis.revenue >= kpis.prevRevenue}
          icon={<TrendingUp className="h-5 w-5 text-green-500" />} />
        <KpiCard label="Dépenses" value={formatEur(kpis.expense)}
          variation={`${computeVariation(kpis.expense, kpis.prevExpense)} vs ${year - 1}`}
          positive={kpis.expense <= kpis.prevExpense}
          icon={<TrendingDown className="h-5 w-5 text-destructive" />} />
        <KpiCard label="Résultat net" value={formatEur(kpis.net)}
          variation="" positive={kpis.net >= 0}
          icon={<Scale className="h-5 w-5 text-primary" />}
          valueColor={kpis.net >= 0 ? 'text-green-600' : 'text-destructive'} />
        <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3 card-hover">
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
              Définir un objectif →
            </Link>
          )}
        </div>
      </div>

      {/* Activity KPI cards */}
      {activityAgg.hasData && (
        <div className="grid grid-cols-3 gap-4">
          {([
            { emoji: '☎️', label: 'Appels découverte', value: activityAgg.discovery_calls, target: activityAgg.target_discovery_calls, icon: <Phone className="h-4 w-4 text-primary" /> },
            { emoji: '👥', label: 'Clientes actives', value: activityAgg.active_clients, target: activityAgg.target_active_clients, icon: <Users className="h-4 w-4 text-primary" /> },
            { emoji: '🎯', label: 'Prospects contactés', value: activityAgg.prospects, target: activityAgg.target_prospects, icon: <Target className="h-4 w-4 text-primary" /> },
          ] as const).map((item) => {
            const pct = item.target > 0 ? Math.min(100, Math.round((item.value / item.target) * 100)) : null;
            return (
              <div key={item.label} className="bg-card rounded-[20px] shadow-soft p-4 space-y-2 card-hover">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{item.emoji} {item.label}</span>
                  {item.icon}
                </div>
                <p className="text-2xl font-mono">{item.value}</p>
                {item.target > 0 && (
                  <>
                    <Progress value={pct ?? 0} className="h-1.5 [&>div]:bg-primary" />
                    <p className="text-[10px] text-muted-foreground font-mono">obj: {item.target}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {period === 'year' && annualTarget > 0 && (
        <AnnualProgressSection
          yearTotalRevenue={yearTotalRevenue} annualTarget={annualTarget} annualPct={annualPct}
          quarterlyBreakdown={quarterlyBreakdown}
          onQuarterClick={(q) => { setPeriod('quarter'); setQuarterVal(q); }}
        />
      )}

      {/* Revenue treemap */}
      <TreemapSection
        title={period === 'year' ? "D'où viennent tes revenus" : `Revenus ${periodLabel}`}
        transactions={data.transactions} categories={data.categories} type="revenue" />

      {/* Monthly chart */}
      <MonthlyChart chartData={chartData} period={period} quarterVal={quarterVal} monthVal={monthVal} />

      {/* Expense treemap */}
      <TreemapSection
        title={`Où part ton argent${period !== 'year' ? ` · ${periodLabel}` : ''}`}
        transactions={data.transactions} categories={data.categories} type="expense" />

      {/* Treasury */}
      <TreasuryCard totalBalance={totalBalance} sparkline={sparkline} hasBankAccounts={data.bankAccounts.length > 0} />

      {/* Latest transactions */}
      <LatestTransactions transactions={data.transactions} catMap={catMap} />
    </div>
  );
}

/* ═══════════ Activity aggregation ═══════════ */

function computeActivityAgg(
  kpis: ActivityKpi[], targets: ActivityTarget[],
  period: PeriodType, periodValue: number,
) {
  let discovery_calls = 0, active_clients = 0, prospects = 0;
  let target_discovery_calls = 0, target_active_clients = 0, target_prospects = 0;

  if (period === 'month') {
    const k = kpis.find(k => k.month === periodValue);
    if (k) { discovery_calls = k.discovery_calls; active_clients = k.active_clients; prospects = k.prospects; }
    const q = Math.ceil(periodValue / 3);
    const t = targets.find(t => t.quarter === q);
    if (t) { target_discovery_calls = Math.round(t.discovery_calls / 3); target_active_clients = Math.round(t.active_clients / 3); target_prospects = Math.round(t.prospects / 3); }
  } else if (period === 'quarter') {
    const months = [(periodValue - 1) * 3 + 1, (periodValue - 1) * 3 + 2, (periodValue - 1) * 3 + 3];
    for (const k of kpis) {
      if (months.includes(k.month)) { discovery_calls += k.discovery_calls; active_clients += k.active_clients; prospects += k.prospects; }
    }
    const t = targets.find(t => t.quarter === periodValue);
    if (t) { target_discovery_calls = t.discovery_calls; target_active_clients = t.active_clients; target_prospects = t.prospects; }
  } else {
    for (const k of kpis) { discovery_calls += k.discovery_calls; active_clients += k.active_clients; prospects += k.prospects; }
    for (const t of targets) { target_discovery_calls += t.discovery_calls; target_active_clients += t.active_clients; target_prospects += t.prospects; }
  }

  const hasData = discovery_calls > 0 || active_clients > 0 || prospects > 0 ||
    target_discovery_calls > 0 || target_active_clients > 0 || target_prospects > 0;

  return { discovery_calls, active_clients, prospects, target_discovery_calls, target_active_clients, target_prospects, hasData };
}

/* ═══════════ Sub-components ═══════════ */

function Header({ year, setYear, period, setPeriod, quarterVal, setQuarterVal, monthVal, setMonthVal }: {
  year: number; setYear: (y: number) => void;
  period: PeriodType; setPeriod: (p: PeriodType) => void;
  quarterVal: number; setQuarterVal: (q: number) => void;
  monthVal: number; setMonthVal: (m: number) => void;
}) {
  const goMonth = (dir: -1 | 1) => {
    let m = monthVal + dir;
    if (m < 1) { m = 12; setYear(year - 1); }
    if (m > 12) { m = 1; setYear(year + 1); }
    setMonthVal(m);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl text-accent">Tableau de bord</h1>
      <div className="flex flex-col items-end gap-2">
        {/* Year selector */}
        <div className="flex items-center gap-2 bg-card rounded-full shadow-soft px-1 py-1">
          <button onClick={() => setYear(year - 1)} className="p-2 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">{year}</span>
          <button onClick={() => setYear(year + 1)} className="p-2 rounded-full hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {/* Period toggle */}
        <div className="flex items-center gap-1 bg-card rounded-full shadow-soft px-1 py-1">
          {(['year', 'quarter', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${period === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              {p === 'year' ? 'Année' : p === 'quarter' ? 'Trimestre' : 'Mois'}
            </button>
          ))}
        </div>
        {/* Sub-selectors */}
        {period === 'quarter' && (
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(q => (
              <button key={q} onClick={() => setQuarterVal(q)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${quarterVal === q ? 'bg-primary text-primary-foreground' : 'bg-card shadow-soft hover:bg-muted'}`}>
                T{q}
              </button>
            ))}
          </div>
        )}
        {period === 'month' && (
          <div className="flex items-center gap-2 bg-card rounded-full shadow-soft px-1 py-1">
            <button onClick={() => goMonth(-1)} className="p-2 rounded-full hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium min-w-[120px] text-center">
              {MONTH_NAMES[monthVal - 1]} {year}
            </span>
            <button onClick={() => goMonth(1)} className="p-2 rounded-full hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, variation, positive, icon, valueColor }: {
  label: string; value: string; variation: string; positive: boolean; icon: React.ReactNode; valueColor?: string;
}) {
  return (
    <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3 card-hover">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className={`text-2xl lg:text-3xl font-mono animate-count ${valueColor ?? ''}`}>{value}</p>
      {variation && (
        <span className={`text-xs font-mono ${positive ? 'text-green-600' : 'text-destructive'}`}>
          {variation}
        </span>
      )}
    </div>
  );
}

/* ─── Annual Progress ─── */

function AnnualProgressSection({ yearTotalRevenue, annualTarget, annualPct, quarterlyBreakdown, onQuarterClick }: {
  yearTotalRevenue: number; annualTarget: number; annualPct: number;
  quarterlyBreakdown: QuarterBreakdown[];
  onQuarterClick: (q: number) => void;
}) {
  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4">
      <h2 className="text-lg text-accent">Progression vers l'objectif annuel</h2>
      {/* Big progress bar */}
      <div className="relative">
        <div className="h-6 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${annualPct}%` }} />
        </div>
        <div className="flex justify-between mt-1 text-xs font-mono text-muted-foreground">
          <span>{formatEur(yearTotalRevenue)}</span>
          <span>{formatEur(annualTarget)}</span>
        </div>
      </div>
      {/* Quarter segments */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quarterlyBreakdown.map(qb => {
          const status = qb.quarter < currentQ ? (qb.realRevenue >= qb.objectiveRevenue ? 'green' : 'red') :
            qb.quarter === currentQ ? 'orange' : 'gray';
          const colors: Record<string, string> = {
            green: 'border-green-400 bg-green-50', red: 'border-destructive/30 bg-red-50',
            orange: 'border-secondary bg-yellow-50', gray: 'border-border bg-muted/30',
          };
          return (
            <button key={qb.quarter} onClick={() => onQuarterClick(qb.quarter)}
              className={`rounded-2xl border-2 p-3 text-left transition-colors hover:shadow-md ${colors[status]}`}>
              <div className="text-sm font-medium text-accent">T{qb.quarter}</div>
              <div className="font-mono text-sm mt-1">{formatEur(qb.realRevenue)}</div>
              {qb.objectiveRevenue > 0 && (
                <div className="text-xs text-muted-foreground font-mono">obj. {formatEur(qb.objectiveRevenue)}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Treemap section (reusable for revenue & expense) ─── */

interface TreemapItem { name: string; emoji: string; color: string; value: number; pct: number; }

function TreemapContent(props: any) {
  const { x, y, width, height, name, emoji, pct, color, value } = props;
  if (!width || !height || width < 4 || height < 4 || !name) return null;
  const isSmall = width < 90 || height < 50;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={8} ry={8}
        style={{ fill: `#${color}`, stroke: '#fff', strokeWidth: 2, opacity: 0.85 }} />
      {isSmall ? (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fontSize={16}>{emoji}</text>
      ) : (
        <>
          <text x={x + width / 2} y={y + height / 2 - 14} textAnchor="middle" dominantBaseline="central" fontSize={15}>{emoji}</text>
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

function TreemapSection({ title, transactions, categories, type }: {
  title: string; transactions: Transaction[]; categories: Category[]; type: 'revenue' | 'expense';
}) {
  const catMap = new Map(categories.map(c => [c.id, c]));
  const totals = new Map<string, number>();
  const total = { sum: 0 };

  for (const tx of transactions) {
    if (!tx.category_id) continue;
    if (type === 'revenue' && tx.amount <= 0) continue;
    if (type === 'expense' && tx.amount >= 0) continue;
    const abs = Math.abs(tx.amount);
    total.sum += abs;
    totals.set(tx.category_id, (totals.get(tx.category_id) ?? 0) + abs);
  }

  const items: TreemapItem[] = Array.from(totals.entries())
    .map(([catId, val]) => {
      const cat = catMap.get(catId);
      return { name: cat?.name ?? 'Autre', emoji: cat?.emoji ?? '❓', color: cat?.color ?? '95A5A6', value: val, pct: total.sum > 0 ? Math.round((val / total.sum) * 100) : 0 };
    })
    .sort((a, b) => b.value - a.value);

  if (items.length === 0) {
    return (
      <div className="bg-card rounded-[20px] shadow-soft p-8 text-center">
        <h2 className="text-lg text-accent mb-2">{title}</h2>
        <Link to="/categories" className="text-sm text-primary hover:underline">
          {type === 'revenue' ? 'Catégorise tes revenus pour voir la répartition →' : 'Catégorise tes transactions pour voir la répartition →'}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4">
      <h2 className="text-lg text-accent">{title}</h2>
      <ResponsiveContainer width="100%" height={240}>
        <Treemap data={items} dataKey="value" aspectRatio={4 / 3} content={<TreemapContent />} />
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {items.map(item => (
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

/* ─── Monthly chart ─── */

function MonthlyChart({ chartData, period, quarterVal, monthVal }: {
  chartData: ChartMonth[]; period: PeriodType; quarterVal: number; monthVal: number;
}) {
  // Determine highlighted range
  let hlStart: number | null = null;
  let hlEnd: number | null = null;
  if (period === 'quarter') {
    hlStart = (quarterVal - 1) * 3; // 0-indexed in chart
    hlEnd = hlStart + 2;
  } else if (period === 'month') {
    hlStart = monthVal - 1;
    hlEnd = hlStart;
  }

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-6">
      <h2 className="text-lg text-accent mb-4">Évolution mois par mois</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(340 20% 92%)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = { revenue: 'Revenus', expense: 'Dépenses', net: 'Net', objectiveMonthly: 'Objectif' };
              return [formatEur(value), labels[name] ?? name];
            }}
          />
          {/* Highlight reference area */}
          {hlStart !== null && hlEnd !== null && (
            <ReferenceArea x1={chartData[hlStart]?.label} x2={chartData[hlEnd]?.label}
              fill="hsl(340 96% 61%)" fillOpacity={0.06} />
          )}
          <Bar dataKey="revenue" fill="hsl(340 96% 61%)" radius={[6, 6, 0, 0]} name="revenue">
            {chartData.map((entry, i) => (
              <Cell key={i} fillOpacity={entry.hasFutureData ? 0 : entry.isCurrent ? 1 : 0.75}
                fill={entry.hasFutureData ? 'transparent' : 'hsl(340 96% 61%)'} />
            ))}
          </Bar>
          <Bar dataKey="expense" fill="#FFA7C6" radius={[6, 6, 0, 0]} name="expense">
            {chartData.map((entry, i) => (
              <Cell key={i} fillOpacity={entry.hasFutureData ? 0 : entry.isCurrent ? 1 : 0.75}
                fill={entry.hasFutureData ? 'transparent' : '#FFA7C6'} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="net" stroke="hsl(0 0% 10%)" strokeWidth={2} dot={false} name="net"
            connectNulls={false} />
          {chartData.some(d => d.objectiveMonthly) && (
            <Line type="stepAfter" dataKey="objectiveMonthly" stroke="#FFE561" strokeWidth={2}
              strokeDasharray="6 4" dot={false} name="objectiveMonthly" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Treasury card ─── */

function TreasuryCard({ totalBalance, sparkline, hasBankAccounts }: {
  totalBalance: number; sparkline: { month: string; net: number }[]; hasBankAccounts: boolean;
}) {
  if (!hasBankAccounts) {
    return (
      <div className="bg-card rounded-[20px] shadow-soft p-5 text-center">
        <h2 className="text-lg text-accent mb-2">Trésorerie</h2>
        <Link to="/tresorerie" className="text-sm text-primary hover:underline">Ajoute un compte bancaire →</Link>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-5 card-hover">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-sm text-muted-foreground mb-1">Trésorerie</h2>
          <p className={`text-3xl font-mono ${totalBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {formatEur(totalBalance)}
          </p>
        </div>
        {sparkline.length > 1 && (
          <div className="w-[140px] h-[40px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline}>
                <Line type="monotone" dataKey="net" stroke="hsl(340 96% 61%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <Link to="/tresorerie" className="text-sm text-primary hover:underline whitespace-nowrap">
          Voir le détail →
        </Link>
      </div>
    </div>
  );
}

/* ─── Latest transactions ─── */

function LatestTransactions({ transactions, catMap }: {
  transactions: Transaction[]; catMap: Map<string, Category>;
}) {
  if (transactions.length === 0) return null;

  return (
    <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
      <div className="px-5 py-4">
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
            {transactions.slice(0, 15).map(tx => {
              const cat = tx.category_id ? catMap.get(tx.category_id) : null;
              return (
                <tr key={tx.id} className="border-t border-border">
                  <td className="px-5 py-2.5 font-mono text-xs">{tx.date}</td>
                  <td className="px-5 py-2.5 max-w-[240px] truncate">{tx.label}</td>
                  <td className="px-5 py-2.5 text-xs">
                    {cat ? <span>{cat.emoji} {cat.name}</span> : <span className="text-muted-foreground">Non catégorisé</span>}
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
  );
}
