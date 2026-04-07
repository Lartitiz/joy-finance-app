import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Save, Plus, ChevronDown, ChevronUp, Trash2, Info, Phone, Users, Target } from 'lucide-react';
import { formatEur } from '@/lib/dashboard-utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

interface AnnualObjective {
  id?: string;
  revenue_target: number;
}

interface MonthlySignedRevenue {
  id: string;
  year: number;
  month: number;
  total_signed: number;
}

interface SignedDetail {
  id: string;
  monthly_signed_id: string;
  offer_id: string | null;
  label: string | null;
  amount: number;
}

interface MonthlyActivityKpi {
  id?: string;
  year: number;
  month: number;
  discovery_calls: number;
  active_clients: number;
  prospects: number;
}

interface QuarterlyActivityTarget {
  id?: string;
  year: number;
  quarter: number;
  discovery_calls: number;
  active_clients: number;
  prospects: number;
}

const ACTIVITY_FIELDS: { key: 'discovery_calls' | 'active_clients' | 'prospects'; icon: typeof Phone; emoji: string; label: string }[] = [
  { key: 'discovery_calls', icon: Phone, emoji: '☎️', label: 'Appels découverte' },
  { key: 'active_clients', icon: Users, emoji: '👥', label: 'Clientes actives' },
  { key: 'prospects', icon: Target, emoji: '🎯', label: 'Prospects contactés' },
];

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

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

  // Signed revenue
  const [signedRevenues, setSignedRevenues] = useState<MonthlySignedRevenue[]>([]);
  const [signedDetails, setSignedDetails] = useState<Map<string, SignedDetail[]>>(new Map());
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  // Activity KPIs
  const [activityKpis, setActivityKpis] = useState<MonthlyActivityKpi[]>([]);
  const [activityTargets, setActivityTargets] = useState<QuarterlyActivityTarget[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingAnnual, setSavingAnnual] = useState(false);
  const [savingQ, setSavingQ] = useState<number | null>(null);

  /* ─── Load ─── */
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;

    const qMonths = quarterMonths(selectedQ);

    const [offersRes, qObjRes, annualObjRes, txRes, signedRes, actKpiRes, actTargetRes] = await Promise.all([
      supabase.from('offers').select('*').eq('user_id', user.id).eq('is_active', true).order('sort_order'),
      supabase.from('quarterly_objectives').select('*').eq('user_id', user.id).eq('year', year),
      supabase.from('annual_objectives').select('id, revenue_target').eq('user_id', user.id).eq('year', year).maybeSingle(),
      supabase.from('transactions').select('date, amount').eq('user_id', user.id).gte('date', yearStart).lt('date', yearEnd),
      supabase.from('monthly_signed_revenue').select('id, year, month, total_signed')
        .eq('user_id', user.id).eq('year', year)
        .in('month', qMonths),
      supabase.from('monthly_activity_kpis').select('*')
        .eq('user_id', user.id).eq('year', year)
        .in('month', qMonths),
      supabase.from('quarterly_activity_targets').select('*')
        .eq('user_id', user.id).eq('year', year),
    ]);

    const fetchedOffers: Offer[] = (offersRes.data ?? []).map((o: any) => ({
      id: o.id, name: o.name, emoji: o.emoji, unit_price: Number(o.unit_price),
      billing_type: o.billing_type, recurring_duration: o.recurring_duration,
      is_active: o.is_active, sort_order: o.sort_order,
    }));
    setOffers(fetchedOffers);

    const fetchedQObj: QuarterlyObjective[] = (qObjRes.data ?? []).map((o: any) => ({
      id: o.id, offer_id: o.offer_id, year: o.year, quarter: o.quarter, target_new_clients: o.target_new_clients,
    }));
    setQObjectives(fetchedQObj);

    const inputs = new Map<string, number>();
    for (const obj of fetchedQObj) {
      inputs.set(`${obj.offer_id}-${obj.quarter}`, obj.target_new_clients);
    }
    setQInputs(inputs);

    if (annualObjRes.data) {
      setAnnualObj({ id: annualObjRes.data.id, revenue_target: Number(annualObjRes.data.revenue_target) });
      setAnnualTargetInput(Number(annualObjRes.data.revenue_target).toString());
    } else {
      setAnnualObj(null);
      setAnnualTargetInput('');
    }

    setQuarterSummaries(computeAllQuarters(fetchedOffers, fetchedQObj));

    const txs = txRes.data ?? [];
    const totalRev = txs.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
    setYearlyActualRevenue(totalRev);

    const qActuals: [number, number, number, number] = [0, 0, 0, 0];
    for (const tx of txs) {
      if (tx.amount <= 0) continue;
      const m = parseInt(tx.date.slice(5, 7), 10);
      const q = Math.ceil(m / 3);
      qActuals[q - 1] += Number(tx.amount);
    }
    setQuarterlyActuals(qActuals);

    // Signed revenues
    const signedData = signedRes.data ?? [];
    setSignedRevenues(signedData.map(s => ({ ...s, total_signed: Number(s.total_signed) })));

    // Load details for each signed revenue
    if (signedData.length > 0) {
      const ids = signedData.map(s => s.id);
      const { data: detailsData } = await supabase
        .from('monthly_signed_revenue_details')
        .select('id, monthly_signed_id, offer_id, label, amount')
        .in('monthly_signed_id', ids);

      const detailMap = new Map<string, SignedDetail[]>();
      for (const d of (detailsData ?? [])) {
        const list = detailMap.get(d.monthly_signed_id) || [];
        list.push({ ...d, amount: Number(d.amount) });
        detailMap.set(d.monthly_signed_id, list);
      }
      setSignedDetails(detailMap);
    } else {
      setSignedDetails(new Map());
    }

    // Activity KPIs
    setActivityKpis((actKpiRes.data ?? []).map((k: any) => ({
      id: k.id, year: k.year, month: k.month,
      discovery_calls: k.discovery_calls, active_clients: k.active_clients, prospects: k.prospects,
    })));
    setActivityTargets((actTargetRes.data ?? []).map((t: any) => ({
      id: t.id, year: t.year, quarter: t.quarter,
      discovery_calls: t.discovery_calls, active_clients: t.active_clients, prospects: t.prospects,
    })));

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

    const upserts = offers.map((offer) => ({
      user_id: user.id, year, quarter: q, offer_id: offer.id,
      target_new_clients: qInputs.get(`${offer.id}-${q}`) ?? 0,
    }));

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

    const updatedObjectives: QuarterlyObjective[] = [];
    const tempInputs = new Map(qInputs);
    tempInputs.set(`${offerId}-${quarter}`, value);
    for (const [key, val] of tempInputs) {
      const [oId, qStr] = key.split('-');
      updatedObjectives.push({ offer_id: oId, year, quarter: parseInt(qStr), target_new_clients: val });
    }
    for (const obj of qObjectives) {
      const key = `${obj.offer_id}-${obj.quarter}`;
      if (!tempInputs.has(key)) updatedObjectives.push(obj);
    }
    setQuarterSummaries(computeAllQuarters(offers, updatedObjectives));
  };

  /* ─── Signed Revenue helpers ─── */
  const getSignedForMonth = (month: number) => signedRevenues.find(s => s.month === month);
  const getDetailsForMonth = (month: number) => {
    const sr = getSignedForMonth(month);
    if (!sr) return [];
    return signedDetails.get(sr.id) ?? [];
  };
  const hasDetails = (month: number) => getDetailsForMonth(month).length > 0;

  const upsertSignedTotal = async (month: number, total: number) => {
    if (!user) return;
    const existing = getSignedForMonth(month);
    if (existing) {
      await supabase.from('monthly_signed_revenue')
        .update({ total_signed: total, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('monthly_signed_revenue')
        .insert({ user_id: user.id, year, month, total_signed: total });
    }
    load();
  };

  const ensureSignedRecord = async (month: number): Promise<string> => {
    if (!user) throw new Error('No user');
    const existing = getSignedForMonth(month);
    if (existing) return existing.id;
    const { data, error } = await supabase.from('monthly_signed_revenue')
      .insert({ user_id: user.id, year, month, total_signed: 0 })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  };

  const saveDetail = async (month: number, detail: SignedDetail) => {
    if (!user) return;
    const monthlyId = await ensureSignedRecord(month);
    if (detail.id.startsWith('new-')) {
      // Insert
      await supabase.from('monthly_signed_revenue_details').insert({
        user_id: user.id, monthly_signed_id: monthlyId,
        offer_id: detail.offer_id, label: detail.label, amount: detail.amount,
      });
    } else {
      await supabase.from('monthly_signed_revenue_details')
        .update({ amount: detail.amount, label: detail.label, offer_id: detail.offer_id })
        .eq('id', detail.id);
    }
    // Recalc total
    const { data: allDetails } = await supabase.from('monthly_signed_revenue_details')
      .select('amount').eq('monthly_signed_id', monthlyId);
    const newTotal = (allDetails ?? []).reduce((s, d) => s + Number(d.amount), 0);
    await supabase.from('monthly_signed_revenue')
      .update({ total_signed: newTotal, updated_at: new Date().toISOString() })
      .eq('id', monthlyId);
    load();
  };

  const deleteDetail = async (month: number, detailId: string) => {
    if (detailId.startsWith('new-')) {
      // Just remove from local state
      load();
      return;
    }
    const sr = getSignedForMonth(month);
    await supabase.from('monthly_signed_revenue_details').delete().eq('id', detailId);
    if (sr) {
      const { data: remaining } = await supabase.from('monthly_signed_revenue_details')
        .select('amount').eq('monthly_signed_id', sr.id);
      const newTotal = (remaining ?? []).reduce((s, d) => s + Number(d.amount), 0);
      await supabase.from('monthly_signed_revenue')
        .update({ total_signed: newTotal, updated_at: new Date().toISOString() })
        .eq('id', sr.id);
    }
    load();
  };

  const addFreeLine = (month: number) => {
    const sr = getSignedForMonth(month);
    const monthlyId = sr?.id ?? 'pending';
    const newDetail: SignedDetail = {
      id: `new-${Date.now()}`, monthly_signed_id: monthlyId,
      offer_id: null, label: '', amount: 0,
    };
    setSignedDetails(prev => {
      const next = new Map(prev);
      const key = sr?.id ?? '__pending_' + month;
      const list = [...(next.get(key) ?? []), newDetail];
      next.set(key, list);
      return next;
    });
  };

  /* ─── Activity KPI helpers ─── */
  const getActivityForMonth = (month: number) => activityKpis.find(k => k.month === month);
  const getActivityTarget = (quarter: number) => activityTargets.find(t => t.quarter === quarter);

  const upsertActivityKpi = async (month: number, field: 'discovery_calls' | 'active_clients' | 'prospects', value: number) => {
    if (!user) return;
    const existing = getActivityForMonth(month);
    if (existing?.id) {
      await supabase.from('monthly_activity_kpis').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('monthly_activity_kpis').upsert({
        user_id: user.id, year, month,
        discovery_calls: field === 'discovery_calls' ? value : 0,
        active_clients: field === 'active_clients' ? value : 0,
        prospects: field === 'prospects' ? value : 0,
      }, { onConflict: 'user_id,year,month' });
    }
    load();
  };

  const upsertActivityTarget = async (quarter: number, field: 'discovery_calls' | 'active_clients' | 'prospects', value: number) => {
    if (!user) return;
    const existing = getActivityTarget(quarter);
    if (existing?.id) {
      await supabase.from('quarterly_activity_targets').update({ [field]: value }).eq('id', existing.id);
    } else {
      await supabase.from('quarterly_activity_targets').upsert({
        user_id: user.id, year, quarter,
        discovery_calls: field === 'discovery_calls' ? value : 0,
        active_clients: field === 'active_clients' ? value : 0,
        prospects: field === 'prospects' ? value : 0,
      }, { onConflict: 'user_id,year,quarter' });
    }
    load();
  };

  const annualTarget = quarterSummaries.reduce((s, qs) => s + qs.totalProjected, 0);
  const annualPct = annualTarget > 0 ? Math.min(100, Math.round((yearlyActualRevenue / annualTarget) * 100)) : null;

  const selectedQSummary = quarterSummaries.find(qs => qs.quarter === selectedQ);
  const qTargetTotal = selectedQSummary?.totalProjected ?? 0;
  const qMonths = quarterMonths(selectedQ);

  // Signed total for the quarter
  const qSignedTotal = qMonths.reduce((s, m) => s + (getSignedForMonth(m)?.total_signed ?? 0), 0);
  const qSignedPct = qTargetTotal > 0 ? Math.min(100, Math.round((qSignedTotal / qTargetTotal) * 100)) : null;

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

        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-2xl font-medium text-foreground">{formatEur(annualTarget)}</span>
          <span className="text-sm text-muted-foreground">calculé depuis T1 + T2 + T3 + T4</span>
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
          {([1, 2, 3, 4] as const).map((q) => {
            const projected = quarterSummaries.find(qs => qs.quarter === q)?.totalProjected ?? 0;
            return (
              <span key={q} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <span className="font-medium">T{q}:</span>
                <span className="font-mono">{formatEur(quarterlyActuals[q - 1])}</span>
                <span className="text-muted-foreground">/ {formatEur(projected)}</span>
              </span>
            );
          })}
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

                <div className="border-t border-border pt-2 flex items-center justify-between">
                  <span className="text-xs font-medium">Total</span>
                  <span className="font-mono text-sm font-medium">{formatEur(qs.totalProjected)}</span>
                </div>

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

                {/* Activity targets */}
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Objectifs activité</p>
                  {ACTIVITY_FIELDS.map(({ key, emoji, label }) => {
                    const target = getActivityTarget(qs.quarter);
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="shrink-0 w-5 text-center">{emoji}</span>
                        <span className="flex-1 truncate">{label}</span>
                        <Input
                          type="number"
                          min={0}
                          defaultValue={target?.[key] ?? 0}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val !== (target?.[key] ?? 0)) upsertActivityTarget(qs.quarter, key, val);
                          }}
                          className="w-14 h-7 text-xs font-mono text-center p-0"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ SECTION 3: CA Signé ═══ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg text-accent font-serif font-normal">CA signé — T{selectedQ} {year}</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Le CA signé, c'est ce que tu as facturé ou contractualisé. C'est différent du CA encaissé (ce qui est arrivé sur ton compte), qui lui est calculé depuis tes imports bancaires.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {qMonths.map((month) => {
            const monthTarget = qTargetTotal / 3;
            const sr = getSignedForMonth(month);
            const total = sr?.total_signed ?? 0;
            const details = getDetailsForMonth(month);
            const hasDetailRows = details.length > 0;
            const isExpanded = expandedMonths.has(month);
            const pct = monthTarget > 0 ? Math.min(100, Math.round((total / monthTarget) * 100)) : 0;
            const isGood = total >= monthTarget && monthTarget > 0;

            return (
              <div key={month} className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-accent">{MONTH_NAMES[month - 1]} {year}</h3>
                  {total > 0 && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-mono font-medium">
                      {formatEur(total)}
                    </span>
                  )}
                </div>

                {/* Main input */}
                {hasDetailRows ? (
                  <div className="space-y-1">
                    <div className="relative">
                      <Input
                        type="number"
                        value={total}
                        readOnly
                        className="font-mono text-xl h-11 pr-8 bg-muted/50 cursor-not-allowed"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Calculé depuis le détail</p>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      type="number"
                      defaultValue={total || ''}
                      placeholder="0"
                      className="font-mono text-xl h-11 pr-8"
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        if (val !== total) upsertSignedTotal(month, val);
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  </div>
                )}

                {/* Expand/collapse button */}
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setExpandedMonths(prev => {
                      const next = new Set(prev);
                      if (next.has(month)) next.delete(month);
                      else next.add(month);
                      return next;
                    });
                  }}
                >
                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Ventiler par offre
                </button>

                {/* Detail rows */}
                {isExpanded && (
                  <div className="space-y-2 pt-1 border-t border-border">
                    {/* Offer lines */}
                    {offers.map((offer) => {
                      const detail = details.find(d => d.offer_id === offer.id);
                      return (
                        <div key={offer.id} className="flex items-center gap-2">
                          <span className="shrink-0 w-5 text-center text-sm">{offer.emoji ?? '📦'}</span>
                          <span className="flex-1 text-xs truncate">{offer.name}</span>
                          <div className="relative w-24">
                            <Input
                              type="number"
                              defaultValue={detail?.amount || ''}
                              placeholder="0"
                              className="font-mono text-xs h-7 pr-6 w-full"
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                if (detail) {
                                  if (val !== detail.amount) saveDetail(month, { ...detail, amount: val });
                                } else if (val > 0) {
                                  saveDetail(month, { id: `new-${Date.now()}`, monthly_signed_id: '', offer_id: offer.id, label: null, amount: val });
                                }
                              }}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">€</span>
                          </div>
                          {detail && (
                            <button onClick={() => deleteDetail(month, detail.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Free lines */}
                    {details.filter(d => !d.offer_id).map((detail) => (
                      <div key={detail.id} className="flex items-center gap-2">
                        <span className="shrink-0 w-5 text-center text-sm">📝</span>
                        <Input
                          type="text"
                          defaultValue={detail.label ?? ''}
                          placeholder="Libellé…"
                          className="flex-1 text-xs h-7"
                          onBlur={(e) => {
                            if (e.target.value !== (detail.label ?? '')) {
                              saveDetail(month, { ...detail, label: e.target.value });
                            }
                          }}
                        />
                        <div className="relative w-24">
                          <Input
                            type="number"
                            defaultValue={detail.amount || ''}
                            placeholder="0"
                            className="font-mono text-xs h-7 pr-6 w-full"
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              if (val !== detail.amount) saveDetail(month, { ...detail, amount: val });
                            }}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">€</span>
                        </div>
                        <button onClick={() => deleteDetail(month, detail.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => addFreeLine(month)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors pt-1"
                    >
                      <Plus className="h-3 w-3" />
                      Ligne libre
                    </button>
                  </div>
                )}

                {/* Activity KPIs */}
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Activité</p>
                  {ACTIVITY_FIELDS.map(({ key, emoji, label }) => {
                    const kpi = getActivityForMonth(month);
                    const target = getActivityTarget(selectedQ);
                    const monthlyTarget = target ? Math.round(target[key] / 3) : 0;
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="shrink-0 w-5 text-center">{emoji}</span>
                        <span className="flex-1 truncate">{label}</span>
                        <Input
                          type="number"
                          min={0}
                          defaultValue={kpi?.[key] ?? 0}
                          placeholder="0"
                          className="w-14 h-7 text-xs font-mono text-center p-0"
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val !== (kpi?.[key] ?? 0)) upsertActivityKpi(month, key, val);
                          }}
                        />
                        {monthlyTarget > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">/{monthlyTarget}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Objective comparison */}
                {monthTarget > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="text-[11px] text-muted-foreground">Objectif : {formatEur(monthTarget)}</p>
                    <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isGood ? 'bg-green-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quarter total */}
        <div className="bg-card rounded-[20px] shadow-soft p-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Total T{selectedQ} signé</span>
          <span className="text-sm">
            <span className="font-mono font-medium">{formatEur(qSignedTotal)}</span>
            {qTargetTotal > 0 && (
              <>
                {' '}/ <span className="font-mono text-muted-foreground">{formatEur(qTargetTotal)}</span>
                {qSignedPct !== null && (
                  <span className={`ml-1 text-xs font-medium ${qSignedTotal >= qTargetTotal ? 'text-green-600' : 'text-muted-foreground'}`}>
                    ({qSignedPct}%)
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      </div>
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
