import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Zap, Trash2, Plus, ArrowRight } from 'lucide-react';
import { normalizeLabel } from '@/lib/rule-utils';

interface Rule {
  id: string;
  keyword: string;
  category_id: string;
  match_count: number;
}

interface Category {
  id: string;
  name: string;
  emoji: string | null;
}

export function CategorizationRules() {
  const { user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [rulesRes, catRes] = await Promise.all([
      supabase
        .from('categorization_rules')
        .select('id, keyword, category_id, match_count')
        .eq('user_id', user.id)
        .order('match_count', { ascending: false }),
      supabase
        .from('categories')
        .select('id, name, emoji')
        .eq('user_id', user.id)
        .order('sort_order'),
    ]);
    if (rulesRes.data) setRules(rulesRes.data);
    if (catRes.data) setCategories(catRes.data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const catLabel = (id: string) => {
    const c = categories.find((c) => c.id === id);
    return c ? `${c.emoji || ''} ${c.name}` : '—';
  };

  const addRule = async () => {
    if (!user) return;
    const kw = normalizeLabel(newKeyword);
    if (!kw || !newCategory) {
      toast.error('Renseigne un mot-clé et une catégorie');
      return;
    }
    const { data, error } = await supabase
      .from('categorization_rules')
      .insert({ user_id: user.id, keyword: kw, category_id: newCategory })
      .select('id, keyword, category_id, match_count')
      .single();
    if (error || !data) {
      toast.error('Ce mot-clé existe déjà');
      return;
    }
    setRules((prev) => [data, ...prev]);
    setNewKeyword('');
    setNewCategory('');
    toast.success('Règle ajoutée');
  };

  const updateKeyword = async (id: string, value: string) => {
    const kw = normalizeLabel(value);
    const current = rules.find((r) => r.id === id);
    if (!kw || !current || kw === current.keyword) return;
    const { data, error } = await supabase
      .from('categorization_rules')
      .update({ keyword: kw, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, keyword, category_id, match_count')
      .single();
    if (error || !data) {
      toast.error('Ce mot-clé existe déjà');
      fetchData();
      return;
    }
    setRules((prev) => prev.map((r) => (r.id === id ? data : r)));
    toast.success('Mot-clé modifié');
  };

  const updateCategory = async (id: string, categoryId: string) => {
    const { error } = await supabase
      .from('categorization_rules')
      .update({ category_id: categoryId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('Erreur');
      return;
    }
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, category_id: categoryId } : r)));
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase.from('categorization_rules').delete().eq('id', id);
    if (error) {
      toast.error('Erreur');
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success('Règle supprimée');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-muted-foreground animate-pulse">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-muted-foreground">
        Quand tu corriges une catégorie, l'appli retient « ce mot-clé → cette catégorie ».
        Au prochain import, les libellés reconnus sont pré-remplis avant même l'IA.
      </p>

      {/* Ajout manuel */}
      <div className="bg-card rounded-[20px] shadow-soft p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Si le libellé contient</label>
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="STRIPE"
            className="font-mono text-sm rounded-lg border border-border bg-background px-3 py-2 w-40 focus:ring-2 focus:ring-ring uppercase"
          />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground mb-3" />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Ranger dans</label>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="text-sm rounded-lg border border-border bg-background px-3 py-2 min-w-[180px] focus:ring-2 focus:ring-ring"
          >
            <option value="">— Choisir —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji || ''} {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={addRule} size="sm" className="mb-0.5">
          <Plus className="h-4 w-4 mr-1" />
          Ajouter
        </Button>
      </div>

      {/* Liste des règles */}
      {rules.length === 0 ? (
        <div className="bg-card rounded-[20px] shadow-soft p-12 text-center">
          <Zap className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">
            Aucune règle pour l'instant. Corrige une catégorie et ta première règle apparaîtra ici.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Mot-clé</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Catégorie</th>
                <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium">Utilisée</th>
                <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    <input
                      defaultValue={r.keyword}
                      key={r.id + r.keyword}
                      onBlur={(e) => updateKeyword(r.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      className="font-mono text-xs rounded-lg border border-border bg-background px-2 py-1 w-36 focus:ring-2 focus:ring-ring uppercase"
                      aria-label="Mot-clé"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={r.category_id}
                      onChange={(e) => updateCategory(r.id, e.target.value)}
                      className="text-xs rounded-lg border border-border bg-background px-2 py-1 max-w-[200px] focus:ring-2 focus:ring-ring"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji || ''} {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                    {r.match_count} fois
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => deleteRule(r.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Supprimer la règle"
                      aria-label="Supprimer la règle"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
