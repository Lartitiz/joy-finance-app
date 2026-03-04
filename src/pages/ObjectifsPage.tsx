import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Save, Plus } from 'lucide-react';
import { formatEur } from '@/lib/dashboard-utils';
import { InvoiceModal } from '@/components/objectifs/InvoiceModal';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

interface Objective {
  id?: string;
  month: string;
  revenue_target: number | null;
  expense_budget: number | null;
}

interface Invoice {
  id: string;
  client_name: string;
  description: string | null;
  amount: number;
  date_issued: string;
  date_due: string | null;
  status: string | null;
  paid_date: string | null;
}

interface MonthActuals {
  revenue: number;
  expense: number;
}

export default function ObjectifsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [objective, setObjective] = useState<Objective | null>(null);
  const [revenueTarget, setRevenueTarget] = useState('');
  const [expenseBudget, setExpenseBudget] = useState('');
  const [actuals, setActuals] = useState<MonthActuals>({ revenue: 0, expense: 0 });
  const [annualData, setAnnualData] = useState<{ month: number; obj: Objective | null; actuals: MonthActuals }[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const monthKey = `${year}-${String(month).padStart(2, '0')}-01`;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const startOfMonth = monthKey;
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    const endOfMonth = `${nextY}-${String(nextM).padStart(2, '0')}-01`;

    // Fetch objective for selected month
    const { data: objData } = await supabase
      .from('monthly_objectives')
      .select('id, month, revenue_target, expense_budget')
      .eq('user_id', user.id)
      .eq('month', startOfMonth)
      .maybeSingle();

    setObjective(objData);
    setRevenueTarget(objData?.revenue_target?.toString() ?? '');
    setExpenseBudget(objData?.expense_budget?.toString() ?? '');

    // Fetch actuals for selected month
    const { data: txData } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .lt('date', endOfMonth);

    const rev = (txData ?? []).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const exp = (txData ?? []).filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    setActuals({ revenue: rev, expense: exp });

    // Fetch invoices for selected month
    const { data: invData } = await supabase
      .from('invoices')
      .select('id, client_name, description, amount, date_issued, date_due, status, paid_date')
      .eq('user_id', user.id)
      .gte('date_issued', startOfMonth)
      .lt('date_issued', endOfMonth)
      .order('date_issued', { ascending: false });

    setInvoices(invData ?? []);

    // Fetch annual data
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;

    const [annualObjRes, annualTxRes] = await Promise.all([
      supabase
        .from('monthly_objectives')
        .select('month, revenue_target, expense_budget')
        .eq('user_id', user.id)
        .gte('month', yearStart)
        .lt('month', yearEnd),
      supabase
        .from('transactions')
        .select('date, amount')
        .eq('user_id', user.id)
        .gte('date', yearStart)
        .lt('date', yearEnd),
    ]);

    const objMap = new Map((annualObjRes.data ?? []).map(o => [o.month.slice(0, 7), o]));
    const monthlyActuals = new Map<string, MonthActuals>();

    for (const tx of annualTxRes.data ?? []) {
      const key = tx.date.slice(0, 7);
      const cur = monthlyActuals.get(key) ?? { revenue: 0, expense: 0 };
      if (tx.amount > 0) cur.revenue += tx.amount;
      else cur.expense += Math.abs(tx.amount);
      monthlyActuals.set(key, cur);
    }

    const annual = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const obj = objMap.get(key) ?? null;
      const act = monthlyActuals.get(key) ?? { revenue: 0, expense: 0 };
      annual.push({ month: m, obj: obj ? { month: obj.month, revenue_target: obj.revenue_target, expense_budget: obj.expense_budget } : null, actuals: act });
    }
    setAnnualData(annual);

    setLoading(false);
  }, [user, year, month, monthKey]);

  useEffect(() => { load(); }, [load]);

  const goMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const handleSaveObjective = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      month: monthKey,
      revenue_target: revenueTarget ? parseFloat(revenueTarget) : null,
      expense_budget: expenseBudget ? parseFloat(expenseBudget) : null,
    };

    if (objective?.id) {
      const { error } = await supabase.from('monthly_objectives').update(payload).eq('id', objective.id);
      if (error) toast.error(error.message);
      else toast.success('Objectif mis à jour');
    } else {
      const { error } = await supabase.from('monthly_objectives').insert(payload);
      if (error) toast.error(error.message.includes('unique') ? 'Objectif déjà défini pour ce mois' : error.message);
      else toast.success('Objectif enregistré');
    }

    setSaving(false);
    load();
  };

  const handleSaveInvoice = async (data: { client_name: string; description: string; amount: number; date_issued: string; date_due: string; status: string }) => {
    if (!user) return;

    if (editingInvoice) {
      const { error } = await supabase.from('invoices').update(data).eq('id', editingInvoice.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Facture modifiée');
    } else {
      const { error } = await supabase.from('invoices').insert({ ...data, user_id: user.id });
      if (error) { toast.error(error.message); return; }
      toast.success('Facture créée');
    }

    setInvoiceModalOpen(false);
    setEditingInvoice(null);
    load();
  };

  const handleDeleteInvoice = async (id: string) => {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Facture supprimée'); load(); }
  };

  const revPct = objective?.revenue_target ? Math.min(100, Math.round((actuals.revenue / objective.revenue_target) * 100)) : null;
  const expPct = objective?.expense_budget ? Math.min(100, Math.round((actuals.expense / objective.expense_budget) * 100)) : null;

  const invoiceTotal = invoices.filter(i => i.status === 'sent' || i.status === 'paid').reduce((s, i) => s + i.amount, 0);

  const statusBadge = (status: string | null) => {
    const map: Record<string, { label: string; cls: string }> = {
      draft: { label: 'Brouillon', cls: 'bg-muted text-muted-foreground' },
      sent: { label: 'Envoyée', cls: 'bg-secondary text-secondary-foreground' },
      paid: { label: 'Payée', cls: 'bg-green-100 text-green-700' },
      overdue: { label: 'En retard', cls: 'bg-destructive/10 text-destructive' },
      cancelled: { label: 'Annulée', cls: 'bg-muted text-muted-foreground' },
    };
    const s = map[status ?? 'draft'] ?? map.draft;
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
  };

  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl">
        <h1 className="text-2xl text-accent">Objectifs</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="bg-card rounded-[20px] shadow-soft h-[120px] animate-pulse" />)}
        </div>
      </div>
    );
  }

  // Annual totals
  const annualTotals = annualData.reduce(
    (acc, d) => ({
      revTarget: acc.revTarget + (d.obj?.revenue_target ?? 0),
      revActual: acc.revActual + d.actuals.revenue,
      expTarget: acc.expTarget + (d.obj?.expense_budget ?? 0),
      expActual: acc.expActual + d.actuals.expense,
    }),
    { revTarget: 0, revActual: 0, expTarget: 0, expActual: 0 }
  );

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl text-accent">Objectifs</h1>
        <div className="flex items-center gap-2 bg-card rounded-full shadow-soft px-1 py-1">
          <button onClick={() => goMonth(-1)} className="p-2 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[140px] text-center">{MONTH_NAMES[month - 1]} {year}</span>
          <button onClick={() => goMonth(1)} className="p-2 rounded-full hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Define objectives */}
      <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4">
        <h2 className="text-lg text-accent">Définir les objectifs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Objectif de revenus</Label>
            <div className="relative">
              <Input
                type="number"
                value={revenueTarget}
                onChange={(e) => setRevenueTarget(e.target.value)}
                className="font-mono pr-8"
                placeholder="0"
                min={0}
                step={100}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Budget dépenses max</Label>
            <div className="relative">
              <Input
                type="number"
                value={expenseBudget}
                onChange={(e) => setExpenseBudget(e.target.value)}
                className="font-mono pr-8"
                placeholder="0"
                min={0}
                step={100}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
            </div>
          </div>
        </div>
        <Button onClick={handleSaveObjective} disabled={saving} size="sm">
          <Save className="h-3.5 w-3.5 mr-1" />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue progress */}
        <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
          <h3 className="text-sm text-muted-foreground">Revenus</h3>
          {revPct !== null ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono">{formatEur(actuals.revenue)}</span>
                <span className="text-xs text-muted-foreground">/ {formatEur(objective!.revenue_target!)} ({revPct}%)</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${revPct}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Définis un objectif de revenus ci-dessus</p>
          )}
        </div>

        {/* Expense progress */}
        <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
          <h3 className="text-sm text-muted-foreground">Dépenses</h3>
          {expPct !== null ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono">{formatEur(actuals.expense)}</span>
                <span className="text-xs text-muted-foreground">/ {formatEur(objective!.expense_budget!)} ({expPct}%)</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${expPct}%`,
                    backgroundColor: expPct < 50 ? '#27AE60' : expPct < 80 ? '#F39C12' : '#E74C3C',
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Définis un budget dépenses ci-dessus</p>
          )}
        </div>
      </div>

      {/* Annual table */}
      <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-lg text-accent">Vue annuelle {year}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Mois</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Obj. revenus</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Revenus réels</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Écart</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Budget dép.</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Dépenses réelles</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Écart</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {annualData.map((d) => {
                const isFuture = d.month > now.getMonth() + 1 || year > now.getFullYear();
                const revTarget = d.obj?.revenue_target ?? null;
                const expTarget = d.obj?.expense_budget ?? null;
                const revDiff = revTarget !== null ? d.actuals.revenue - revTarget : null;
                const expDiff = expTarget !== null ? d.actuals.expense - expTarget : null;

                return (
                  <tr
                    key={d.month}
                    className={`border-t border-border ${d.month === month ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-sans text-sm">{MONTH_NAMES[d.month - 1]}</td>
                    <td className="px-4 py-2.5 text-right">{revTarget !== null ? formatEur(revTarget) : <span className="text-muted-foreground">—</span>}</td>
                    <td className={`px-4 py-2.5 text-right ${isFuture ? 'text-muted-foreground' : ''}`}>
                      {isFuture && d.actuals.revenue === 0 ? '—' : formatEur(d.actuals.revenue)}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${revDiff === null ? '' : revDiff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {revDiff !== null && !isFuture ? `${revDiff >= 0 ? '+' : ''}${formatEur(revDiff)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">{expTarget !== null ? formatEur(expTarget) : <span className="text-muted-foreground">—</span>}</td>
                    <td className={`px-4 py-2.5 text-right ${isFuture ? 'text-muted-foreground' : ''}`}>
                      {isFuture && d.actuals.expense === 0 ? '—' : formatEur(d.actuals.expense)}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${expDiff === null ? '' : expDiff <= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {expDiff !== null && !isFuture ? `${expDiff <= 0 ? '' : '+'}${formatEur(expDiff)}` : '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-border bg-muted/30 font-medium">
                <td className="px-4 py-3 font-sans text-sm">TOTAL</td>
                <td className="px-4 py-3 text-right">{annualTotals.revTarget > 0 ? formatEur(annualTotals.revTarget) : '—'}</td>
                <td className="px-4 py-3 text-right">{formatEur(annualTotals.revActual)}</td>
                <td className={`px-4 py-3 text-right ${annualTotals.revActual - annualTotals.revTarget >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {annualTotals.revTarget > 0 ? `${annualTotals.revActual - annualTotals.revTarget >= 0 ? '+' : ''}${formatEur(annualTotals.revActual - annualTotals.revTarget)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right">{annualTotals.expTarget > 0 ? formatEur(annualTotals.expTarget) : '—'}</td>
                <td className="px-4 py-3 text-right">{formatEur(annualTotals.expActual)}</td>
                <td className={`px-4 py-3 text-right ${annualTotals.expActual - annualTotals.expTarget <= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {annualTotals.expTarget > 0 ? `${annualTotals.expActual - annualTotals.expTarget <= 0 ? '' : '+'}${formatEur(annualTotals.expActual - annualTotals.expTarget)}` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoices section */}
      <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-lg text-accent">Tes factures ce mois-ci</h2>
            {objective?.revenue_target && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Total facturé : <span className="font-mono">{formatEur(invoiceTotal)}</span> / {formatEur(objective.revenue_target)} objectif
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => { setEditingInvoice(null); setInvoiceModalOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouvelle facture
          </Button>
        </div>

        {invoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs text-muted-foreground font-medium">Client</th>
                  <th className="text-left px-5 py-2.5 text-xs text-muted-foreground font-medium">Description</th>
                  <th className="text-right px-5 py-2.5 text-xs text-muted-foreground font-medium">Montant</th>
                  <th className="text-center px-5 py-2.5 text-xs text-muted-foreground font-medium">Statut</th>
                  <th className="text-center px-5 py-2.5 text-xs text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-5 py-2.5">{inv.client_name}</td>
                    <td className="px-5 py-2.5 text-muted-foreground max-w-[200px] truncate">{inv.description || '—'}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{formatEur(inv.amount)}</td>
                    <td className="px-5 py-2.5 text-center">{statusBadge(inv.status)}</td>
                    <td className="px-5 py-2.5 text-center">
                      <button
                        onClick={() => { setEditingInvoice(inv); setInvoiceModalOpen(true); }}
                        className="text-xs text-primary hover:underline mr-2"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteInvoice(inv.id)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <p className="text-sm text-muted-foreground">Aucune facture ce mois-ci.</p>
          </div>
        )}
      </div>

      <InvoiceModal
        open={invoiceModalOpen}
        onOpenChange={(open) => { setInvoiceModalOpen(open); if (!open) setEditingInvoice(null); }}
        onSave={handleSaveInvoice}
        invoice={editingInvoice}
        defaultDate={monthKey}
      />
    </div>
  );
}
