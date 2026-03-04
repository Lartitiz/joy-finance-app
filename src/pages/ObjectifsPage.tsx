import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Save, Plus, AlertTriangle } from 'lucide-react';
import { formatEur } from '@/lib/dashboard-utils';
import { InvoiceModal } from '@/components/objectifs/InvoiceModal';
import { InvoiceDetailSheet } from '@/components/objectifs/InvoiceDetailSheet';
import {
  computeAllQuarters,
  quarterLabel,
  quarterMonths,
  currentQuarter,
  type Offer,
  type QuarterlyObjective,
  type QuarterSummary,
} from '@/lib/objectives-utils';

/* ─── Types ─── */

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

interface AnnualObjective {
  id?: string;
  revenue_target: number;
}

/* ─── Main Page ─── */

export default function ObjectifsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [selectedQ, setSelectedQ] = useState(currentQuarter());

  // Data
  const [offers, setOffers] = useState<Offer[]>([]);
  const [qObjectives, setQObjectives] = useState<QuarterlyObjective[]>([]);
  const [annualObj, setAnnualObj] = useState<AnnualObjective | null>(null);
  const [annualTargetInput, setAnnualTargetInput] = useState('');
  const [quarterSummaries, setQuarterSummaries] = useState<QuarterSummary[]>([]);
  const [yearlyActualRevenue, setYearlyActualRevenue] = useState(0);
  const [quarterlyActuals, setQuarterlyActuals] = useState<[number, number, number, number]>([0, 0, 0, 0]);

  // Quarterly inputs: offerId-quarter -> target_new_clients
  const [qInputs, setQInputs] = useState<Map<string, number>>(new Map());

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingAnnual, setSavingAnnual] = useState(false);
  const [savingQ, setSavingQ] = useState<number | null>(null);

  /* ─── Load ─── */
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;

    // Quarter date range for invoices
    const qMonths = quarterMonths(selectedQ);
    const qStart = `${year}-${String(qMonths[0]).padStart(2, '0')}-01`;
    const qEndMonth = qMonths[2] + 1;
    const qEndYear = qEndMonth > 12 ? year + 1 : year;
    const qEnd = `${qEndYear}-${String(qEndMonth > 12 ? 1 : qEndMonth).padStart(2, '0')}-01`;

    const [offersRes, qObjRes, annualObjRes, txRes, invRes] = await Promise.all([
      supabase.from('offers').select('*').eq('user_id', user.id).eq('is_active', true).order('sort_order'),
      supabase.from('quarterly_objectives').select('*').eq('user_id', user.id).eq('year', year),
      supabase.from('annual_objectives').select('id, revenue_target').eq('user_id', user.id).eq('year', year).maybeSingle(),
      supabase.from('transactions').select('date, amount').eq('user_id', user.id).gte('date', yearStart).lt('date', yearEnd),
      supabase.from('invoices').select('id, client_name, description, amount, date_issued, date_due, status, paid_date')
        .eq('user_id', user.id).gte('date_issued', qStart).lt('date_issued', qEnd).order('date_issued', { ascending: false }),
    ]);

    const fetchedOffers: Offer[] = (offersRes.data ?? []).map((o: any) => ({
      id: o.id,
      name: o.name,
      emoji: o.emoji,
      unit_price: Number(o.unit_price),
      billing_type: o.billing_type,
      recurring_duration: o.recurring_duration,
      is_active: o.is_active,
      sort_order: o.sort_order,
    }));
    setOffers(fetchedOffers);

    const fetchedQObj: QuarterlyObjective[] = (qObjRes.data ?? []).map((o: any) => ({
      id: o.id,
      offer_id: o.offer_id,
      year: o.year,
      quarter: o.quarter,
      target_new_clients: o.target_new_clients,
    }));
    setQObjectives(fetchedQObj);

    // Populate inputs
    const inputs = new Map<string, number>();
    for (const obj of fetchedQObj) {
      inputs.set(`${obj.offer_id}-${obj.quarter}`, obj.target_new_clients);
    }
    setQInputs(inputs);

    // Annual objective
    if (annualObjRes.data) {
      setAnnualObj({ id: annualObjRes.data.id, revenue_target: Number(annualObjRes.data.revenue_target) });
      setAnnualTargetInput(Number(annualObjRes.data.revenue_target).toString());
    } else {
      setAnnualObj(null);
      setAnnualTargetInput('');
    }

    // Compute quarterly summaries
    setQuarterSummaries(computeAllQuarters(fetchedOffers, fetchedQObj));

    // Actuals from transactions
    const txs = txRes.data ?? [];
    const totalRev = txs.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
    setYearlyActualRevenue(totalRev);

    // Per-quarter actuals
    const qActuals: [number, number, number, number] = [0, 0, 0, 0];
    for (const tx of txs) {
      if (tx.amount <= 0) continue;
      const m = parseInt(tx.date.slice(5, 7), 10);
      const q = Math.ceil(m / 3);
      qActuals[q - 1] += Number(tx.amount);
    }
    setQuarterlyActuals(qActuals);

    setInvoices(invRes.data ?? []);
    setLoading(false);
  }, [user, year, selectedQ]);

  useEffect(() => { load(); }, [load]);

  /* ─── Save annual objective ─── */
  const handleSaveAnnual = async () => {
    if (!user) return;
    const target = parseFloat(annualTargetInput);
    if (isNaN(target) || target < 0) { toast.error('Montant invalide'); return; }
    setSavingAnnual(true);

    if (annualObj?.id) {
      const { error } = await supabase.from('annual_objectives').update({ revenue_target: target }).eq('id', annualObj.id);
      if (error) toast.error(error.message);
      else toast.success('Objectif annuel mis à jour');
    } else {
      const { error } = await supabase.from('annual_objectives').insert({ user_id: user.id, year, revenue_target: target });
      if (error) toast.error(error.message);
      else toast.success('Objectif annuel enregistré');
    }
    setSavingAnnual(false);
    load();
  };

  /* ─── Save quarter objectives ─── */
  const handleSaveQuarter = async (q: number) => {
    if (!user) return;
    setSavingQ(q);

    // Collect all offer inputs for this quarter
    const upserts = offers.map((offer) => ({
      user_id: user.id,
      year,
      quarter: q,
      offer_id: offer.id,
      target_new_clients: qInputs.get(`${offer.id}-${q}`) ?? 0,
    }));

    // Delete existing for this quarter then insert
    await supabase.from('quarterly_objectives').delete().eq('user_id', user.id).eq('year', year).eq('quarter', q);
    const { error } = await supabase.from('quarterly_objectives').insert(upserts);
    if (error) toast.error(error.message);
    else toast.success(`Objectifs T${q} enregistrés`);

    setSavingQ(null);
    load();
  };

  /* ─── Input handler ─── */
  const setQInput = (offerId: string, quarter: number, value: number) => {
    setQInputs((prev) => {
      const next = new Map(prev);
      next.set(`${offerId}-${quarter}`, value);
      return next;
    });

    // Recompute summaries locally
    const updatedObjectives: QuarterlyObjective[] = [];
    const tempInputs = new Map(qInputs);
    tempInputs.set(`${offerId}-${quarter}`, value);
    for (const [key, val] of tempInputs) {
      const [oId, qStr] = key.split('-');
      updatedObjectives.push({ offer_id: oId, year, quarter: parseInt(qStr), target_new_clients: val });
    }
    // Also include existing objectives not in inputs
    for (const obj of qObjectives) {
      const key = `${obj.offer_id}-${obj.quarter}`;
      if (!tempInputs.has(key)) {
        updatedObjectives.push(obj);
      }
    }
    setQuarterSummaries(computeAllQuarters(offers, updatedObjectives));
  };

  /* ─── Invoice handlers ─── */
  const qMonths = quarterMonths(selectedQ);
  const defaultInvoiceDate = `${year}-${String(qMonths[0]).padStart(2, '0')}-01`;

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

  const handleMarkPaid = async (id: string) => {
    const { error } = await supabase.from('invoices').update({ status: 'paid', paid_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Facture marquée comme payée'); load(); }
  };

  const handleSaveFromSheet = async (data: { client_name: string; description: string; amount: number; date_issued: string; date_due: string; status: string; paid_date: string | null }) => {
    if (!detailInvoice) return;
    const { error } = await supabase.from('invoices').update(data).eq('id', detailInvoice.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Facture mise à jour');
    setDetailSheetOpen(false);
    setDetailInvoice(null);
    load();
  };

  /* ─── Derived ─── */
  const annualTarget = annualObj?.revenue_target ?? 0;
  const annualPct = annualTarget > 0 ? Math.min(100, Math.round((yearlyActualRevenue / annualTarget) * 100)) : null;

  const today = new Date().toISOString().slice(0, 10);
  const overdueInvoices = invoices.filter(i => i.date_due && i.date_due < today && i.status !== 'paid' && i.status !== 'cancelled');
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amount, 0);

  const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const sentTotal = invoices.filter(i => i.status === 'sent' && !overdueInvoices.find(o => o.id === i.id)).reduce((s, i) => s + i.amount, 0);

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl">
        <h1 className="text-2xl text-accent">Objectifs</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-card rounded-[20px] shadow-soft h-[140px] animate-pulse" />)}
        </div>
      </div>
    );
  }

  /* ─── Render ─── */
  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header + Year selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl text-accent">Objectifs</h1>
        <YearSelector year={year} onChange={setYear} />
      </div>

      {/* ═══ SECTION 1: Annual header ═══ */}
      <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-5 card-hover">
        <h2 className="text-lg text-accent font-serif font-normal">Objectif annuel {year}</h2>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Input
              type="number"
              value={annualTargetInput}
              onChange={(e) => setAnnualTargetInput(e.target.value)}
              onBlur={handleSaveAnnual}
              className="font-mono text-2xl h-12 w-48 pr-8"
              placeholder="0"
              min={0}
              step={1000}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">€</span>
          </div>
          <Button onClick={handleSaveAnnual} disabled={savingAnnual} size="sm" variant="outline">
            <Save className="h-3.5 w-3.5 mr-1" />
            {savingAnnual ? '…' : 'Enregistrer'}
          </Button>
        </div>

        {annualTarget > 0 && (
          <>
            <Progress value={annualPct ?? 0} className="h-3 [&>div]:bg-primary" />
            <p className="text-sm text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{formatEur(yearlyActualRevenue)}</span>
              {' '}/{' '}
              <span className="font-mono">{formatEur(annualTarget)}</span>
              {annualPct !== null && <span className="ml-1">({annualPct}%)</span>}
            </p>
          </>
        )}

        {/* Quarter badges */}
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3, 4] as const).map((q) => (
            <span key={q} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
              <span className="font-medium">T{q}:</span>
              <span className="font-mono">{formatEur(quarterlyActuals[q - 1])}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ═══ SECTION 2: Quarterly cards ═══ */}
      {offers.length === 0 ? (
        <div className="bg-card rounded-[20px] shadow-soft p-12 text-center space-y-3">
          <span className="text-5xl">🎯</span>
          <h2 className="text-lg text-accent font-serif font-normal">Configure tes offres pour définir tes objectifs</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Tes offres par défaut seront créées automatiquement à l'inscription. Si tu ne les vois pas, vérifie ton compte.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {quarterSummaries.map((qs) => {
            const actual = quarterlyActuals[qs.quarter - 1];
            const isSelected = qs.quarter === selectedQ;
            const isFuture = year > now.getFullYear() || (year === now.getFullYear() && qs.quarter > currentQuarter());
            const isGood = actual >= qs.totalProjected && qs.totalProjected > 0;

            return (
              <div
                key={qs.quarter}
                className={`bg-card rounded-[20px] shadow-soft p-5 space-y-4 cursor-pointer transition-all ${
                  isSelected ? 'ring-2 ring-primary' : 'card-hover'
                }`}
                onClick={() => setSelectedQ(qs.quarter)}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-serif font-normal text-accent">T{qs.quarter}</h3>
                    <p className="text-xs text-muted-foreground">{quarterLabel(qs.quarter)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-medium">{formatEur(qs.totalProjected)}</p>
                    {!isFuture && qs.totalProjected > 0 && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        isGood ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'
                      }`}>
                        Réel: {formatEur(actual)}
                      </span>
                    )}
                    {isFuture && qs.totalProjected > 0 && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                        À venir
                      </span>
                    )}
                  </div>
                </div>

                {/* Offer rows */}
                <div className="space-y-2.5">
                  {qs.offerRows.map((row) => (
                    <div key={row.offer.id} className="flex items-center gap-2 text-sm">
                      <span className="shrink-0 w-5 text-center">{row.offer.emoji ?? '📦'}</span>
                      <span className="flex-1 truncate text-xs">{row.offer.name}</span>
                      <Input
                        type="number"
                        min={0}
                        value={qInputs.get(`${row.offer.id}-${qs.quarter}`) ?? 0}
                        onChange={(e) => setQInput(row.offer.id, qs.quarter, parseInt(e.target.value) || 0)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-14 h-7 text-xs font-mono text-center p-0"
                      />
                      <span className="font-mono text-xs text-muted-foreground w-16 text-right">{formatEur(row.projectedRevenue)}</span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="border-t border-border pt-2 flex items-center justify-between">
                  <span className="text-xs font-medium">Total</span>
                  <span className="font-mono text-sm font-medium">{formatEur(qs.totalProjected)}</span>
                </div>

                {/* Save button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={savingQ === qs.quarter}
                  onClick={(e) => { e.stopPropagation(); handleSaveQuarter(qs.quarter); }}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {savingQ === qs.quarter ? '…' : `Enregistrer T${qs.quarter}`}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ SECTION 3: Invoices for selected quarter ═══ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg text-accent font-serif font-normal">
            Factures — T{selectedQ} {year}
          </h2>
          <Button onClick={() => { setEditingInvoice(null); setInvoiceModalOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nouvelle facture
          </Button>
        </div>

        {/* Overdue alert */}
        {overdueInvoices.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-[16px] p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {overdueInvoices.length} facture{overdueInvoices.length > 1 ? 's' : ''} en retard ({formatEur(overdueTotal)})
              </p>
              <p className="text-xs text-destructive/70 mt-0.5">Pense à relancer tes clients 💪</p>
            </div>
          </div>
        )}

        {/* Mini stacked bar */}
        {invoices.length > 0 && (
          <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
            {paidTotal > 0 && (
              <div className="bg-green-400 transition-all" style={{ flex: paidTotal }} title={`Payées: ${formatEur(paidTotal)}`} />
            )}
            {sentTotal > 0 && (
              <div className="bg-primary/60 transition-all" style={{ flex: sentTotal }} title={`Envoyées: ${formatEur(sentTotal)}`} />
            )}
            {overdueTotal > 0 && (
              <div className="bg-destructive transition-all" style={{ flex: overdueTotal }} title={`En retard: ${formatEur(overdueTotal)}`} />
            )}
          </div>
        )}

        {/* Invoice table */}
        {invoices.length === 0 ? (
          <div className="bg-card rounded-[20px] shadow-soft p-12 text-center space-y-3">
            <span className="text-5xl">🧾</span>
            <h3 className="text-lg text-accent font-serif font-normal">Aucune facture ce trimestre</h3>
            <p className="text-sm text-muted-foreground">Crée ta première facture pour suivre tes paiements.</p>
            <Button onClick={() => { setEditingInvoice(null); setInvoiceModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Créer une facture
            </Button>
          </div>
        ) : (
          <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Client</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Description</th>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Montant</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Émission</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Échéance</th>
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isOverdue = inv.date_due && inv.date_due < today && inv.status !== 'paid' && inv.status !== 'cancelled';
                    return (
                      <tr
                        key={inv.id}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => { setDetailInvoice(inv); setDetailSheetOpen(true); }}
                      >
                        <td className="px-4 py-2.5 font-medium">{inv.client_name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[200px]">{inv.description || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{formatEur(inv.amount)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{inv.date_issued}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{inv.date_due ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusBadge status={isOverdue ? 'overdue' : (inv.status ?? 'draft')} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <InvoiceModal
        open={invoiceModalOpen}
        onOpenChange={setInvoiceModalOpen}
        onSave={handleSaveInvoice}
        invoice={editingInvoice}
        defaultDate={defaultInvoiceDate}
      />
      <InvoiceDetailSheet
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        invoice={detailInvoice}
        onSave={handleSaveFromSheet}
        onDelete={handleDeleteInvoice}
        onMarkPaid={handleMarkPaid}
      />
    </div>
  );
}

/* ─── Sub-components ─── */

function YearSelector({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="flex items-center gap-2 bg-card rounded-full shadow-soft px-1 py-1">
      <button onClick={() => onChange(year - 1)} className="p-2 rounded-full hover:bg-muted transition-colors">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium min-w-[60px] text-center">{year}</span>
      <button onClick={() => onChange(year + 1)} className="p-2 rounded-full hover:bg-muted transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Brouillon', cls: 'bg-muted text-muted-foreground' },
    sent: { label: 'Envoyée', cls: 'bg-secondary text-secondary-foreground' },
    paid: { label: 'Payée', cls: 'bg-green-100 text-green-700' },
    overdue: { label: 'En retard', cls: 'bg-destructive/10 text-destructive' },
    cancelled: { label: 'Annulée', cls: 'bg-muted text-muted-foreground' },
  };
  const s = map[status] ?? map.draft;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
