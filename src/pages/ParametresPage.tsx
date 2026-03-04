import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LogOut, Download, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ParametresPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null; created_at: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name, email, created_at').eq('id', user.id).maybeSingle().then(({ data }) => {
      setProfile(data);
    });
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('date, label, amount, subcategory, notes, source, categories(name, emoji)')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      const header = 'Date,Libellé,Montant,Catégorie,Sous-catégorie,Notes,Source';
      const csvRows = rows.map(r => {
        const cat = (r as any).categories;
        const catLabel = cat ? `${cat.emoji || ''} ${cat.name}`.trim() : '';
        return [r.date, `"${(r.label ?? '').replace(/"/g, '""')}"`, r.amount, `"${catLabel}"`, `"${r.subcategory ?? ''}"`, `"${(r.notes ?? '').replace(/"/g, '""')}"`, r.source ?? ''].join(',');
      });
      const csv = [header, ...csvRows].join('\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} transactions exportées`);
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur lors de l\'export');
    }
    setExporting(false);
  };

  const handleDeleteAllData = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // Delete in order to respect FK constraints
      await supabase.from('transactions').delete().eq('user_id', user.id);
      await supabase.from('invoices').delete().eq('user_id', user.id);
      await supabase.from('monthly_objectives').delete().eq('user_id', user.id);
      await supabase.from('bank_accounts').delete().eq('user_id', user.id);
      await supabase.from('import_batches').delete().eq('user_id', user.id);
      await supabase.from('categories').delete().eq('user_id', user.id);

      // Re-trigger default categories by calling the edge function or inserting defaults
      // Since the handle_new_user trigger only fires on signup, we manually insert defaults
      const defaultExpenses = [
        { name: 'Outils & SaaS', emoji: '🖥️', color: '3498db', type: 'expense', is_default: true, sort_order: 1 },
        { name: 'Loyer & charges', emoji: '🏠', color: 'E67E22', type: 'expense', is_default: true, sort_order: 2 },
        { name: 'Sous-traitance', emoji: '👩‍💻', color: '9B59B6', type: 'expense', is_default: true, sort_order: 3 },
        { name: 'Formation', emoji: '📚', color: '27AE60', type: 'expense', is_default: true, sort_order: 4 },
        { name: 'Déplacements', emoji: '🚗', color: 'F39C12', type: 'expense', is_default: true, sort_order: 5 },
        { name: 'Matériel & fournitures', emoji: '📦', color: '1ABC9C', type: 'expense', is_default: true, sort_order: 6 },
        { name: 'Communication & marketing', emoji: '📱', color: 'FB3D80', type: 'expense', is_default: true, sort_order: 7 },
        { name: 'Repas d\'affaires', emoji: '🍽️', color: 'E74C3C', type: 'expense', is_default: true, sort_order: 8 },
        { name: 'Charges sociales & fiscales', emoji: '🏦', color: '7F8C8D', type: 'expense', is_default: true, sort_order: 9 },
        { name: 'Assurances', emoji: '📋', color: '34495E', type: 'expense', is_default: true, sort_order: 10 },
        { name: 'Autre dépense', emoji: '❓', color: '95A5A6', type: 'expense', is_default: true, sort_order: 11 },
      ];
      const defaultRevenues = [
        { name: 'Missions agency', emoji: '🤝', color: 'FB3D80', type: 'revenue', is_default: true, sort_order: 1 },
        { name: 'Accompagnement binôme', emoji: '👯', color: 'FFE561', type: 'revenue', is_default: true, sort_order: 2 },
        { name: 'Formations & cours', emoji: '🎓', color: '27AE60', type: 'revenue', is_default: true, sort_order: 3 },
        { name: 'Outil premium (abonnements)', emoji: '💻', color: '3498db', type: 'revenue', is_default: true, sort_order: 4 },
        { name: 'Conférences & ateliers', emoji: '🎤', color: '9B59B6', type: 'revenue', is_default: true, sort_order: 5 },
        { name: 'Autre revenu', emoji: '❓', color: '95A5A6', type: 'revenue', is_default: true, sort_order: 6 },
      ];

      const allDefaults = [...defaultExpenses, ...defaultRevenues].map(c => ({ ...c, user_id: user.id }));
      await supabase.from('categories').insert(allDefaults);

      toast.success('Toutes les données ont été supprimées. Les catégories par défaut ont été recréées.');
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur lors de la suppression');
    }
    setDeleting(false);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl text-accent">Paramètres</h1>

      {/* ───── 3. My data ───── */}
      <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4 card-hover">
        <h2 className="text-lg text-accent font-serif font-normal">Mes données</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Export en cours…' : 'Exporter mes transactions (CSV)'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5">
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer toutes mes données
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[20px]">
              <AlertDialogHeader>
                <AlertDialogTitle>Tu es sûr(e) ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action supprimera <span className="font-medium text-foreground">toutes</span> tes transactions, factures, objectifs, comptes bancaires et catégories personnalisées. Les catégories par défaut seront recréées. Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAllData}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? 'Suppression…' : 'Oui, tout supprimer'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ───── 4. About ───── */}
      <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-2 card-hover">
        <h2 className="text-lg text-accent font-serif font-normal">À propos</h2>
        <p className="text-sm font-medium">Nowadays Finance</p>
        <p className="text-sm text-muted-foreground">Outil de pilotage financier pour indépendants et freelances.</p>
        <p className="text-sm text-muted-foreground">
          Créé par <span className="font-medium text-foreground">Laetitia Mattioli</span> / Nowadays Agency
        </p>
        <a
          href="https://nowadaysagency.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          nowadaysagency.com <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
