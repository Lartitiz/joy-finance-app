import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Wallet, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { formatEur } from '@/lib/dashboard-utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Link } from 'react-router-dom';

const MONTH_NAMES_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

interface BankAccount {
  id: string;
  name: string;
  current_balance: number | null;
  last_updated: string | null;
  created_at: string;
}

interface ChartPoint {
  label: string;
  solde: number;
}

export default function TresoreriePage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [avgExpenses, setAvgExpenses] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountBalance, setAccountBalance] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Fetch accounts
    const { data: accs } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at');

    setAccounts(accs ?? []);

    const totalBalance = (accs ?? []).reduce((s, a) => s + (a.current_balance ?? 0), 0);

    // Fetch 6 months of transactions for chart
    const sixMonthsAgo = new Date(currentYear, currentMonth - 5, 1);
    const sixStart = sixMonthsAgo.toISOString().slice(0, 10);
    const nowEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data: txData } = await supabase
      .from('transactions')
      .select('date, amount')
      .eq('user_id', user.id)
      .gte('date', sixStart)
      .lte('date', nowEnd);

    // Build monthly net flows
    const monthlyNet = new Map<string, number>();
    for (const tx of txData ?? []) {
      const key = tx.date.slice(0, 7);
      monthlyNet.set(key, (monthlyNet.get(key) ?? 0) + tx.amount);
    }

    // Build chart: work backwards from current balance
    const points: ChartPoint[] = [];
    let runningBalance = totalBalance;

    // Current month first, then go backwards
    const months: { key: string; label: string }[] = [];
    for (let i = 0; i <= 5; i++) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear() !== currentYear ? d.getFullYear() : ''}`.trim();
      months.push({ key, label });
    }

    // Current month balance = totalBalance
    // Previous month = totalBalance - currentMonthNet
    for (let i = 0; i < months.length; i++) {
      if (i === 0) {
        points.push({ label: months[i].label, solde: runningBalance });
      } else {
        const prevMonthKey = months[i - 1].key;
        runningBalance -= (monthlyNet.get(prevMonthKey) ?? 0);
        points.push({ label: months[i].label, solde: runningBalance });
      }
    }

    setChartData(points.reverse());

    // Pending invoices (sent, not paid)
    const { data: invData } = await supabase
      .from('invoices')
      .select('amount')
      .eq('user_id', user.id)
      .eq('status', 'sent');

    setPendingInvoices((invData ?? []).reduce((s, i) => s + i.amount, 0));

    // Average expenses over last 3 months
    const threeMonthsAgo = new Date(currentYear, currentMonth - 2, 1);
    const threeStart = threeMonthsAgo.toISOString().slice(0, 10);

    const { data: expData } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('date', threeStart)
      .lte('date', nowEnd);

    const totalExp = (expData ?? []).reduce((s, t) => s + Math.abs(t.amount), 0);
    setAvgExpenses(totalExp / 3);

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const totalBalance = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const projection = totalBalance + pendingInvoices - avgExpenses;

  const handleOpenModal = (account?: BankAccount) => {
    if (account) {
      setEditingAccount(account);
      setAccountName(account.name);
      setAccountBalance((account.current_balance ?? 0).toString());
    } else {
      setEditingAccount(null);
      setAccountName('');
      setAccountBalance('');
    }
    setModalOpen(true);
  };

  const handleSaveAccount = async () => {
    if (!user || !accountName.trim()) return;

    const payload = {
      name: accountName.trim(),
      current_balance: accountBalance ? parseFloat(accountBalance) : 0,
      last_updated: new Date().toISOString().slice(0, 10),
    };

    if (editingAccount) {
      const { error } = await supabase.from('bank_accounts').update(payload).eq('id', editingAccount.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Compte mis à jour');
    } else {
      const { error } = await supabase.from('bank_accounts').insert({ ...payload, user_id: user.id });
      if (error) { toast.error(error.message); return; }
      toast.success('Compte ajouté');
    }

    setModalOpen(false);
    load();
  };

  const handleDeleteAccount = async (id: string) => {
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Compte supprimé'); load(); }
  };

  const hasNegative = chartData.some(p => p.solde < 0);

  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl">
        <h1 className="text-2xl text-accent">Trésorerie</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-card rounded-[20px] shadow-soft h-[120px] animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="text-2xl text-accent">Trésorerie</h1>

      {/* ───── SECTION 1: Accounts ───── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg text-accent font-serif font-normal">Mes comptes</h2>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Ajouter un compte
          </Button>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-card rounded-[20px] shadow-soft p-8 text-center">
            <p className="text-4xl mb-3">🏦</p>
            <p className="text-muted-foreground text-sm">Ajoute ton premier compte bancaire pour commencer à suivre ta trésorerie.</p>
            <Button size="sm" className="mt-4" onClick={() => handleOpenModal()}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter un compte
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total card */}
            <div className="bg-card rounded-[20px] shadow-soft p-5 border-2 border-primary/20">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                <Wallet className="h-4 w-4" />
                Solde total
              </div>
              <p className={`text-3xl font-mono font-medium ${totalBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {formatEur(totalBalance)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{accounts.length} compte{accounts.length > 1 ? 's' : ''}</p>
            </div>

            {/* Individual accounts */}
            {accounts.map(acc => (
              <div key={acc.id} className="bg-card rounded-[20px] shadow-soft p-5 group relative">
                <button
                  onClick={() => handleOpenModal(acc)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <p className="text-sm text-muted-foreground mb-1">{acc.name}</p>
                <p className={`text-2xl font-mono font-medium ${(acc.current_balance ?? 0) >= 0 ? '' : 'text-destructive'}`}>
                  {formatEur(acc.current_balance ?? 0)}
                </p>
                {acc.last_updated && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Mis à jour le {new Date(acc.last_updated).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ───── SECTION 2: Chart ───── */}
      {chartData.length > 0 && accounts.length > 0 && (
        <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
          <h2 className="text-lg text-accent font-serif font-normal">Évolution de la trésorerie</h2>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="soldeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(340, 96%, 61%)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(340, 96%, 61%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(340, 20%, 90%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'hsl(0, 0%, 40%)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(0, 0%, 40%)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  width={45}
                />
                <Tooltip
                  formatter={(value: number) => [formatEur(value), 'Solde']}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(340, 20%, 90%)', fontSize: 13 }}
                />
                {hasNegative && <ReferenceLine y={0} stroke="hsl(0, 84%, 60%)" strokeDasharray="4 4" />}
                <Area
                  type="monotone"
                  dataKey="solde"
                  stroke="hsl(340, 96%, 61%)"
                  strokeWidth={2.5}
                  fill="url(#soldeFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ───── SECTION 3: Forecast ───── */}
      {accounts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg text-accent font-serif font-normal">Prévisionnel simplifié</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Expected income */}
            <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Entrées attendues
              </div>
              <p className="text-2xl font-mono font-medium text-green-600">{formatEur(pendingInvoices)}</p>
              <p className="text-[10px] text-muted-foreground">Factures envoyées non payées</p>
              {pendingInvoices === 0 && (
                <Link to="/objectifs" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  Créer une facture <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Recurring expenses */}
            <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingDown className="h-4 w-4 text-destructive" />
                Sorties récurrentes
              </div>
              <p className="text-2xl font-mono font-medium text-destructive">{formatEur(avgExpenses)}</p>
              <p className="text-[10px] text-muted-foreground">Moyenne mensuelle (3 derniers mois)</p>
            </div>

            {/* Projection */}
            <div className={`rounded-[20px] shadow-soft p-5 space-y-2 ${projection >= 0 ? 'bg-green-50 border border-green-200' : 'bg-destructive/5 border border-destructive/20'}`}>
              <p className="text-sm text-muted-foreground">Projection fin de mois</p>
              <p className={`text-2xl font-mono font-medium ${projection >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {formatEur(projection)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {formatEur(totalBalance)} + {formatEur(pendingInvoices)} − {formatEur(avgExpenses)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ───── Account Modal ───── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-sm rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-serif font-normal text-accent">
              {editingAccount ? 'Modifier le compte' : 'Nouveau compte'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nom du compte</Label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Ex : Compte courant pro" />
            </div>
            <div className="space-y-1.5">
              <Label>Solde actuel (€)</Label>
              <Input
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(e.target.value)}
                className="font-mono"
                placeholder="0"
                step={0.01}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editingAccount && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                onClick={() => { handleDeleteAccount(editingAccount.id); setModalOpen(false); }}
              >
                Supprimer
              </Button>
            )}
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveAccount}>{editingAccount ? 'Enregistrer' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
