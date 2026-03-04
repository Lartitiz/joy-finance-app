import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Transaction {
  id: string;
  date: string;
  label: string;
  amount: number;
  category_id: string | null;
  is_validated: boolean | null;
  source: string | null;
}

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
  color: string | null;
}

interface AiSuggestion {
  transaction_id: string;
  suggested_category_id: string;
  confidence: 'high' | 'medium' | 'low';
}

interface SuggestionRow extends Transaction {
  suggested_category_id: string;
  selected_category_id: string;
  confidence: 'high' | 'medium' | 'low';
}

export function CategorizeTransactions() {
  const { user } = useAuth();
  const [uncategorized, setUncategorized] = useState<Transaction[]>([]);
  const [categorized, setCategorized] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [showCategorized, setShowCategorized] = useState(false);
  const [categorizedThisMonth, setCategorizedThisMonth] = useState(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [txRes, catRes, catThisMonthRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, date, label, amount, category_id, is_validated, source')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase
        .from('categories')
        .select('id, name, emoji, type, color')
        .eq('user_id', user.id)
        .order('sort_order'),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('category_id', 'is', null)
        .eq('is_validated', true)
        .gte('created_at', startOfMonth.toISOString()),
    ]);

    if (txRes.data) {
      setUncategorized(txRes.data.filter((t) => !t.category_id));
      setCategorized(txRes.data.filter((t) => t.category_id));
    }
    if (catRes.data) setCategories(catRes.data);
    setCategorizedThisMonth(catThisMonthRes.count ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAiCategorize = async () => {
    if (uncategorized.length === 0) {
      toast.info('Aucune transaction à catégoriser.');
      return;
    }

    setAiLoading(true);
    const batch = uncategorized.slice(0, 50);

    try {
      const { data, error } = await supabase.functions.invoke('categorize-transactions', {
        body: {
          transactions: batch.map((t) => ({
            id: t.id,
            date: t.date,
            label: t.label,
            amount: t.amount,
          })),
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            type: c.type,
          })),
        },
      });

      if (error) throw error;

      const aiSuggestions: AiSuggestion[] = data.suggestions || [];
      const suggestionMap = new Map(aiSuggestions.map((s) => [s.transaction_id, s]));

      const rows: SuggestionRow[] = batch.map((t) => {
        const s = suggestionMap.get(t.id);
        return {
          ...t,
          suggested_category_id: s?.suggested_category_id || '',
          selected_category_id: s?.suggested_category_id || '',
          confidence: s?.confidence || 'low',
        };
      });

      setSuggestions(rows);
      toast.success(`${aiSuggestions.length} suggestions générées !`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de l'appel IA");
    } finally {
      setAiLoading(false);
    }
  };

  const updateSuggestionCategory = (txId: string, categoryId: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === txId ? { ...s, selected_category_id: categoryId } : s))
    );
  };

  const validateOne = async (row: SuggestionRow) => {
    if (!row.selected_category_id) return;
    const isManual = row.selected_category_id !== row.suggested_category_id;

    const { error } = await supabase
      .from('transactions')
      .update({
        category_id: row.selected_category_id,
        is_validated: true,
        source: isManual ? 'manual' : 'ai_suggested',
      })
      .eq('id', row.id);

    if (error) {
      toast.error('Erreur lors de la validation');
      return;
    }

    setSuggestions((prev) => prev.filter((s) => s.id !== row.id));
    toast.success('Transaction catégorisée');
    fetchData();
  };

  const validateBulk = async (filter?: 'high') => {
    const toValidate = filter
      ? suggestions.filter((s) => s.confidence === 'high' && s.selected_category_id)
      : suggestions.filter((s) => s.selected_category_id);

    if (toValidate.length === 0) return;

    let successCount = 0;
    for (const row of toValidate) {
      const isManual = row.selected_category_id !== row.suggested_category_id;
      const { error } = await supabase
        .from('transactions')
        .update({
          category_id: row.selected_category_id,
          is_validated: true,
          source: isManual ? 'manual' : 'ai_suggested',
        })
        .eq('id', row.id);
      if (!error) successCount++;
    }

    setSuggestions((prev) =>
      prev.filter((s) => !toValidate.some((v) => v.id === s.id))
    );
    toast.success(`${successCount} transactions catégorisées`);
    fetchData();
  };

  const recategorize = async (txId: string, categoryId: string) => {
    const { error } = await supabase
      .from('transactions')
      .update({
        category_id: categoryId,
        is_validated: true,
        source: 'manual',
      })
      .eq('id', txId);

    if (error) {
      toast.error('Erreur');
      return;
    }
    toast.success('Catégorie mise à jour');
    fetchData();
  };

  const getCategoryLabel = (catId: string | null) => {
    if (!catId) return '—';
    const cat = categories.find((c) => c.id === catId);
    return cat ? `${cat.emoji || ''} ${cat.name}` : '—';
  };

  const confidenceBadge = (c: string) => {
    switch (c) {
      case 'high':
        return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">haute</span>;
      case 'medium':
        return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">moyenne</span>;
      default:
        return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">faible</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-muted-foreground animate-pulse">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-sm font-medium">
          {uncategorized.length} transaction{uncategorized.length !== 1 ? 's' : ''} à catégoriser
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 px-4 py-1.5 text-sm font-medium">
          <CheckCircle className="h-3.5 w-3.5" />
          {categorizedThisMonth} catégorisée{categorizedThisMonth !== 1 ? 's' : ''} ce mois
        </span>
      </div>

      {/* AI button */}
      {suggestions.length === 0 && (
        <Button onClick={handleAiCategorize} disabled={aiLoading || uncategorized.length === 0} size="lg">
          <Sparkles className="h-4 w-4 mr-2" />
          {aiLoading ? "L'IA analyse tes transactions…" : 'Catégoriser avec l\'IA'}
        </Button>
      )}

      {/* AI loading skeleton */}
      {aiLoading && (
        <div className="bg-card rounded-[20px] shadow-soft p-8 space-y-4">
          <p className="text-muted-foreground text-center">L'IA analyse tes transactions…</p>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Suggestions table */}
      {suggestions.length > 0 && !aiLoading && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <h3 className="text-lg text-accent">Suggestions de l'IA</h3>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => validateBulk('high')}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Valider les high confidence
            </Button>
            <Button size="sm" onClick={() => validateBulk()}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Tout valider
            </Button>
          </div>

          <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Libellé</th>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Montant</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Catégorie suggérée</th>
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium">Confiance</th>
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-2.5 font-mono text-xs">{row.date}</td>
                      <td className="px-4 py-2.5 max-w-[240px] truncate">{row.label}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs ${row.amount >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {row.amount >= 0 ? '+' : ''}{row.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={row.selected_category_id}
                          onChange={(e) => updateSuggestionCategory(row.id, e.target.value)}
                          className="w-full max-w-[200px] rounded-lg border border-border bg-background px-2 py-1 text-xs focus:ring-2 focus:ring-ring"
                        >
                          <option value="">— Choisir —</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.emoji || ''} {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-center">{confidenceBadge(row.confidence)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => validateOne(row)}
                          disabled={!row.selected_category_id}
                          className="text-green-600 hover:text-green-700 disabled:opacity-30 p-1"
                          title="Valider"
                        >
                          ✅
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Already categorized (collapsible) */}
      {categorized.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowCategorized(!showCategorized)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCategorized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {categorized.length} transaction{categorized.length !== 1 ? 's' : ''} déjà catégorisée{categorized.length !== 1 ? 's' : ''}
          </button>

          {showCategorized && (
            <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Libellé</th>
                      <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Montant</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Catégorie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorized.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-4 py-2.5 font-mono text-xs">{t.date}</td>
                        <td className="px-4 py-2.5 max-w-[240px] truncate">{t.label}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs ${t.amount >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {t.amount >= 0 ? '+' : ''}{t.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={t.category_id || ''}
                            onChange={(e) => recategorize(t.id, e.target.value)}
                            className="w-full max-w-[200px] rounded-lg border border-border bg-background px-2 py-1 text-xs focus:ring-2 focus:ring-ring"
                          >
                            <option value="">— Aucune —</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.emoji || ''} {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {uncategorized.length === 0 && suggestions.length === 0 && (
        <div className="bg-card rounded-[20px] shadow-soft p-12 text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="text-muted-foreground">Toutes tes transactions sont catégorisées 🎉</p>
        </div>
      )}
    </div>
  );
}
