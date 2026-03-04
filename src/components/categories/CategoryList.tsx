import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { CategoryModal } from './CategoryModal';
import { DeleteCategoryDialog } from './DeleteCategoryDialog';

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  type: string;
  is_default: boolean | null;
  sort_order: number | null;
}

interface CategoryStats {
  category_id: string;
  tx_count: number;
  month_total: number;
}

const COLOR_PALETTE = [
  'FB3D80', 'FFE561', '3498db', 'E67E22', '9B59B6', '27AE60',
  'F39C12', '1ABC9C', 'E74C3C', '7F8C8D', '34495E', '95A5A6',
];

export function CategoryList() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Map<string, CategoryStats>>(new Map());
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [modalType, setModalType] = useState<'expense' | 'revenue'>('expense');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteTxCount, setDeleteTxCount] = useState(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [catRes, txRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, emoji, color, type, is_default, sort_order')
        .eq('user_id', user.id)
        .order('sort_order')
        .order('name'),
      supabase
        .from('transactions')
        .select('category_id, amount, date')
        .eq('user_id', user.id)
        .not('category_id', 'is', null),
    ]);

    if (catRes.data) setCategories(catRes.data);

    if (txRes.data) {
      const statsMap = new Map<string, CategoryStats>();
      for (const tx of txRes.data) {
        if (!tx.category_id) continue;
        const existing = statsMap.get(tx.category_id) || { category_id: tx.category_id, tx_count: 0, month_total: 0 };
        existing.tx_count++;
        if (tx.date >= startOfMonth) {
          existing.month_total += Number(tx.amount);
        }
        statsMap.set(tx.category_id, existing);
      }
      setStats(statsMap);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = (type: 'expense' | 'revenue') => {
    setEditingCategory(null);
    setModalType(type);
    setModalOpen(true);
  };

  const handleEdit = (cat: Category) => {
    setEditingCategory(cat);
    setModalType(cat.type === 'revenue' ? 'revenue' : 'expense');
    setModalOpen(true);
  };

  const handleSave = async (data: { name: string; emoji: string; color: string; type: string }) => {
    if (!user) return;

    if (editingCategory) {
      const { error } = await supabase
        .from('categories')
        .update({ name: data.name, emoji: data.emoji, color: data.color, type: data.type })
        .eq('id', editingCategory.id);
      if (error) {
        toast.error(error.message.includes('unique') ? 'Ce nom de catégorie existe déjà.' : error.message);
        return;
      }
      toast.success('Catégorie modifiée');
    } else {
      const maxOrder = categories
        .filter(c => c.type === data.type || c.type === 'both')
        .reduce((max, c) => Math.max(max, c.sort_order ?? 0), 0);

      const { error } = await supabase.from('categories').insert({
        user_id: user.id,
        name: data.name,
        emoji: data.emoji,
        color: data.color,
        type: data.type,
        sort_order: maxOrder + 1,
      });
      if (error) {
        toast.error(error.message.includes('unique') ? 'Ce nom de catégorie existe déjà.' : error.message);
        return;
      }
      toast.success('Catégorie créée');
    }

    setModalOpen(false);
    fetchData();
  };

  const handleDeleteClick = async (cat: Category) => {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id);
    setDeleteTxCount(count ?? 0);
    setDeleteTarget(cat);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    // Decategorize transactions first
    await supabase
      .from('transactions')
      .update({ category_id: null, is_validated: false })
      .eq('category_id', deleteTarget.id);

    // Also decategorize invoices
    await supabase
      .from('invoices')
      .update({ category_id: null })
      .eq('category_id', deleteTarget.id);

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Catégorie supprimée');
    }

    setDeleteTarget(null);
    fetchData();
  };

  const renderSection = (title: string, type: 'expense' | 'revenue') => {
    const filtered = categories.filter(c => c.type === type || c.type === 'both');

    return (
      <div className="space-y-4">
        <h3 className="text-lg text-accent">{title}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((cat) => {
            const s = stats.get(cat.id);
            return (
              <div key={cat.id} className="bg-card rounded-[20px] shadow-soft p-4 flex items-center gap-3 group">
                {/* Color swatch */}
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: cat.color ? `#${cat.color}` : '#ccc' }}
                />
                {/* Emoji + name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {cat.emoji && <span className="mr-1.5">{cat.emoji}</span>}
                    {cat.name}
                  </p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{s?.tx_count ?? 0} transaction{(s?.tx_count ?? 0) !== 1 ? 's' : ''}</span>
                    <span className="font-mono">
                      {(s?.month_total ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € ce mois
                    </span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(cat)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Modifier">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDeleteClick(cat)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={() => handleCreate(type)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nouvelle catégorie
        </Button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-muted-foreground animate-pulse">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {renderSection('Mes catégories de dépenses', 'expense')}
      {renderSection('Mes catégories de revenus', 'revenue')}

      <CategoryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSave={handleSave}
        category={editingCategory}
        defaultType={modalType}
        colorPalette={COLOR_PALETTE}
      />

      <DeleteCategoryDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        categoryName={deleteTarget?.name ?? ''}
        txCount={deleteTxCount}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
