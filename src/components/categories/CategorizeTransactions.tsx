import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle, Check, ChevronDown, ChevronUp, Lightbulb, X, Zap } from 'lucide-react';
import { extractKeyword, matchRule, type CategorizationRule } from '@/lib/rule-utils';

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
  origin: 'rule' | 'ai';
}

interface LearnedRule {
  rule: CategorizationRule;
  category_id: string;
}

export function CategorizeTransactions() {
  const { user } = useAuth();
  const [uncategorized, setUncategorized] = useState<Transaction[]>([]);
  const [categorized, setCategorized] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [showCategorized, setShowCategorized] = useState(false);
  const [categorizedThisMonth, setCategorizedThisMonth] = useState(0);
  const [lastLearned, setLastLearned] = useState<LearnedRule | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [txRes, catRes, catThisMonthRes, rulesRes] = await Promise.all([
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
      supabase
        .from('categorization_rules')
        .select('id, keyword, category_id, match_count')
        .eq('user_id', user.id),
    ]);

    if (txRes.data) {
      setUncategorized(txRes.data.filter((t) => !t.category_id));
      setCategorized(txRes.data.filter((t) => t.category_id));
    }
    if (catRes.data) setCategories(catRes.data);
    if (rulesRes.data) setRules(rulesRes.data);
    setCategorizedThisMonth(catThisMonthRes.count ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Apprend (ou renforce) une règle à partir d'une correction manuelle.
  const learnRule = async (label: string, categoryId: string) => {
    if (!user) return;
    const keyword = extractKeyword(label);
    if (!keyword) return; // libellé trop pauvre pour en tirer un mot-clé sûr

    const existing = rules.find((r) => r.keyword === keyword);

    if (existing) {
      const nextCount = existing.match_count + 1;
      const { data, error } = await supabase
        .from('categorization_rules')
        .update({ category_id: categoryId, match_count: nextCount, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, keyword, category_id, match_count')
        .single();
      if (error || !data) return;
      setRules((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      setLastLearned({ rule: data, category_id: categoryId });
    } else {
      const { data, error } = await supabase
        .from('categorization_rules')
        .insert({ user_id: user.id, keyword, category_id: categoryId })
        .select('id, keyword, category_id, match_count')
        .single();
      if (error || !data) return;
      setRules((prev) => [...prev, data]);
      setLastLearned({ rule: data, category_id: categoryId });
    }
  };

  // Modifie le mot-clé de la dernière règle apprise (bulle éditable).
  const updateLearnedKeyword = async (newKeyword: string) => {
    if (!lastLearned) return;
    const kw = newKeyword.trim().toUpperCase();
    if (!kw) return;
    const { data, error } = await supabase
      .from('categorization_rules')
      .update({ keyword: kw, updated_at: new Date().toISOString() })
      .eq('id', lastLearned.rule.id)
      .select('id, keyword, category_id, match_count')
      .single();
    if (error || !data) {
      toast.error('Ce mot-clé existe déjà dans une autre règle');
      return;
    }
    setRules((prev) => prev.map((r) => (r.id === data.id ? data : r)));
    setLastLearned({ rule: data, category_id: data.category_id });
    toast.success('Mot-clé de la règle modifié');
  };

  // Annule la dernière règle apprise.
  const cancelLearnedRule = async () => {
    if (!lastLearned) return;
    const id = lastLearned.rule.id;
    setLastLearned(null);
    const { error } = await supabase.from('categorization_rules').delete().eq('id', id);
    if (error) {
      toast.error("Impossible d'annuler la règle");
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success('Règle annulée');
  };

  const handleAiCategorize = async () => {
    if (uncategorized.length === 0) {
      toast.info('Aucune transaction à catégoriser.');
      return;
    }

    setAiLoading(true);
    const batch = uncategorized.slice(0, 50);

    // 1. On applique d'abord les règles apprises (déterministe, gratuit, instantané).
    const ruleRows: SuggestionRow[] = [];
    const toAsk: Transaction[] = [];
    for (const t of batch) {
      const rule = matchRule(t.label, rules);
      if (rule) {
        ruleRows.push({
          ...t,
          suggested_category_id: rule.category_id,
          selected_category_id: rule.category_id,
          confidence: 'high',
          origin: 'rule',
        });
      } else {
        toAsk.push(t);
      }
    }

    // 2. On ne sollicite l'IA que sur ce que les règles n'ont pas reconnu.
    try {
      let aiSuggestions: AiSuggestion[] = [];
      if (toAsk.length > 0) {
        const { data, error } = await supabase.functions.invoke('categorize-transactions', {
          body: {
            transactions: toAsk.map((t) => ({
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
        aiSuggestions = data.suggestions || [];
      }

      const suggestionMap = new Map(aiSuggestions.map((s) => [s.transaction_id, s]));
      const aiRows: SuggestionRow[] = toAsk.map((t) => {
        const s = suggestionMap.get(t.id);
        return {
          ...t,
          suggested_category_id: s?.suggested_category_id || '',
          selected_category_id: s?.suggested_category_id || '',
          confidence: s?.confidence || 'low',
          origin: 'ai',
        };
      });

      setSuggestions([...ruleRows, ...aiRows]);

      if (ruleRows.length > 0 && aiRows.length > 0) {
        toast.success(`${ruleRows.length} par tes règles, ${aiRows.length} par l'IA`);
      } else if (ruleRows.length > 0) {
        toast.success(`${ruleRows.length} reconnue${ruleRows.length !== 1 ? 's' : ''} par tes règles`);
      } else {
        toast.success(`${aiRows.length} suggestion${aiRows.length !== 1 ? 's' : ''} générée${aiRows.length !== 1 ? 's' : ''}`);
      }
    } catch (err) {
      console.error(err);
      // Même si l'IA échoue, on garde les lignes reconnues par les règles.
      if (ruleRows.length > 0) {
        setSuggestions(ruleRows);
        toast.warning(`IA indisponible — ${ruleRows.length} ligne(s) reconnues par tes règles`);
      } else {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'appel IA");
      }
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
    const source = isManual ? 'manual' : row.origin === 'rule' ? 'rule' : 'ai_suggested';

    const { error } = await supabase
      .from('transactions')
      .update({
        category_id: row.selected_category_id,
        is_validated: true,
        source,
      })
      .eq('id', row.id);

    if (error) {
      toast.error('Erreur lors de la validation');
      return;
    }

    // Une correction manuelle nourrit les règles.
    if (isManual) await learnRule(row.label, row.selected_category_id);

    setSuggestions((prev) => prev.filter((s) => s.id !== row.id));
    toast.success('Transaction catégorisée');
    fetchData();
  };

  const validateBulk = async (filter?: 'high' | 'rule') => {
    const toValidate =
      filter === 'rule'
        ? suggestions.filter((s) => s.origin === 'rule' && s.selected_category_id)
        : filter === 'high'
        ? suggestions.filter((s) => s.confidence === 'high' && s.selected_category_id)
        : suggestions.filter((s) => s.selected_category_id);

    if (toValidate.length === 0) return;

    let successCount = 0;
    for (const row of toValidate) {
      const isManual = row.selected_category_id !== row.suggested_category_id;
      const source = isManual ? 'manual' : row.origin === 'rule' ? 'rule' : 'ai_suggested';
      const { error } = await supabase
        .from('transactions')
        .update({
          category_id: row.selected_category_id,
          is_validated: true,
          source,
        })
        .eq('id', row.id);
      if (!error) {
        successCount++;
        if (isManual) await learnRule(row.label, row.selected_category_id);
      }
    }

    setSuggestions((prev) => prev.filter((s) => !toValidate.some((v) => v.id === s.id)));
    toast.success(`${successCount} transactions catégorisées`);
    fetchData();
  };

  const recategorize = async (txId: string, categoryId: string, label: string) => {
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
    if (categoryId) await learnRule(label, categoryId);
    toast.success('Catégorie mise à jour');
    fetchData();
  };

  const getCategoryLabel = (catId: string | null) => {
    if (!catId) return '—';
    const cat = categories.find((c) => c.id === catId);
    return cat ? `${cat.emoji || ''} ${cat.name}` : '—';
  };

  const confidenceBadge = (row: SuggestionRow) => {
    if (row.origin === 'rule') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
          <Zap className="h-3 w-3" /> règle
        </span>
      );
    }
    switch (row.confidence) {
      case 'high':
        return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">haute</span>;
      case 'medium':
        return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">moyenne</span>;
      default:
        return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">faible</span>;
    }
  };

  const ruleCount = suggestions.filter((s) => s.origin === 'rule').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-muted-foreground animate-pulse">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bulle : règle apprise (mot-clé éditable) */}
      {lastLearned && (
        <div className="rounded-[16px] bg-green-50 border border-green-200 p-3 flex flex-wrap items-center gap-2">
          <Lightbulb className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-700">Règle apprise : libellé contient</span>
          <input
            defaultValue={lastLearned.rule.keyword}
            key={lastLearned.rule.id + lastLearned.rule.keyword}
            onBlur={(e) => {
              const v = e.target.value.trim().toUpperCase();
              if (v && v !== lastLearned.rule.keyword) updateLearnedKeyword(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="font-mono text-xs bg-background border border-green-300 rounded px-2 py-0.5 w-32 focus:ring-2 focus:ring-green-400"
            aria-label="Mot-clé de la règle"
          />
          <span className="text-sm text-green-700">→ {getCategoryLabel(lastLearned.category_id)}</span>
          <span className="flex-1" />
          <button
            onClick={cancelLearnedRule}
            className="text-xs text-green-700 hover:text-green-900 inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> annuler
          </button>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-sm font-medium">
          {uncategorized.length} transaction{uncategorized.length !== 1 ? 's' : ''} à catégoriser
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 px-4 py-1.5 text-sm font-medium">
          <CheckCircle className="h-3.5 w-3.5" />
          {categorizedThisMonth} catégorisée{categorizedThisMonth !== 1 ? 's' : ''} ce mois
        </span>
        {rules.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-4 py-1.5 text-sm font-medium">
            <Zap className="h-3.5 w-3.5" />
            {rules.length} règle{rules.length !== 1 ? 's' : ''} apprise{rules.length !== 1 ? 's' : ''}
          </span>
        )}
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
            <h3 className="text-lg text-accent">Suggestions</h3>
            <div className="flex-1" />
            {ruleCount > 0 && (
              <Button size="sm" variant="outline" onClick={() => validateBulk('rule')}>
                <Zap className="h-3.5 w-3.5 mr-1" />
                Valider les règles ({ruleCount})
              </Button>
            )}
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
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium">Origine</th>
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
                      <td className="px-4 py-2.5 text-center">{confidenceBadge(row)}</td>
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
                            onChange={(e) => recategorize(t.id, e.target.value, t.label)}
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
