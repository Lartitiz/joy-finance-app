import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LogOut, Download, Trash2, ExternalLink, Pencil, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatEur } from '@/lib/dashboard-utils';
import { OfferModal } from '@/components/objectifs/OfferModal';

interface Offer {
  id: string;
  name: string;
  emoji: string | null;
  unit_price: number;
  billing_type: 'recurring_monthly' | 'one_time';
  recurring_duration: number | null;
  sort_order: number | null;
}

export default function ParametresPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null; created_at: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Offers
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  const loadProfile = useCallback(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name, email, created_at').eq('id', user.id).maybeSingle().then(({ data }) => {
      setProfile(data);
    });
  }, [user]);

  const loadOffers = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('offers')
      .select('id, name, emoji, unit_price, billing_type, recurring_duration, sort_order')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order');
    setOffers((data ?? []).map((o: any) => ({ ...o, unit_price: Number(o.unit_price) })));
  }, [user]);

  useEffect(() => {
    loadProfile();
    loadOffers();
  }, [loadProfile, loadOffers]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleSaveOffer = async (data: { name: string; emoji: string; unit_price: number; billing_type: 'recurring_monthly' | 'one_time'; recurring_duration: number | null }) => {
    if (!user) return;
    if (editingOffer) {
      const { error } = await supabase.from('offers').update(data).eq('id', editingOffer.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Offre modifiée');
    } else {
      const maxOrder = offers.length > 0 ? Math.max(...offers.map(o => o.sort_order ?? 0)) : 0;
      const { error } = await supabase.from('offers').insert({ ...data, user_id: user.id, sort_order: maxOrder + 1 });
      if (error) {
        toast.error(error.message.includes('unique') ? 'Une offre avec ce nom existe déjà' : error.message);
        return;
      }
      toast.success('Offre créée');
    }
    setOfferModalOpen(false);
    setEditingOffer(null);
    loadOffers();
  };

  const handleDeleteOffer = async (id: string) => {
    const { error } = await supabase.from('offers').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Offre supprimée'); loadOffers(); }
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
      await supabase.from('transactions').delete().eq('user_id', user.id);
      await supabase.from('invoices').delete().eq('user_id', user.id);
      await supabase.from('monthly_objectives').delete().eq('user_id', user.id);
      await supabase.from('monthly_signed_revenue_details').delete().eq('user_id', user.id);
      await supabase.from('monthly_signed_revenue').delete().eq('user_id', user.id);
      await supabase.from('monthly_activity_kpis').delete().eq('user_id', user.id);
      await supabase.from('quarterly_activity_targets').delete().eq('user_id', user.id);
      await supabase.from('quarterly_objectives').delete().eq('user_id', user.id);
      await supabase.from('annual_objectives').delete().eq('user_id', user.id);
      await supabase.from('bank_accounts').delete().eq('user_id', user.id);
      await supabase.from('import_batches').delete().eq('user_id', user.id);
      await supabase.from('offers').delete().eq('user_id', user.id);
      await supabase.from('categories').delete().eq('user_id', user.id);

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

      // Recreate default offers
      const defaultOffers = [
        { name: 'Ta Binôme', emoji: '👯', unit_price: 250, billing_type: 'recurring_monthly', recurring_duration: 6, sort_order: 1 },
        { name: 'Agency', emoji: '🤝', unit_price: 2000, billing_type: 'one_time', recurring_duration: null, sort_order: 2 },
        { name: 'Cours école', emoji: '🎓', unit_price: 2000, billing_type: 'one_time', recurring_duration: null, sort_order: 3 },
        { name: 'Backup', emoji: '🔄', unit_price: 600, billing_type: 'one_time', recurring_duration: null, sort_order: 4 },
        { name: 'L\'Assistant', emoji: '💻', unit_price: 15, billing_type: 'recurring_monthly', recurring_duration: null, sort_order: 5 },
      ];
      await supabase.from('offers').insert(defaultOffers.map(o => ({ ...o, user_id: user.id })));

      toast.success('Toutes les données ont été supprimées. Les catégories et offres par défaut ont été recréées.');
      loadOffers();
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur lors de la suppression');
    }
    setDeleting(false);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl text-accent">Paramètres</h1>

      {/* ───── 1. Profile ───── */}
      <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4 card-hover">
        <h2 className="text-lg text-accent font-serif font-normal">Mon profil</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Nom</p>
            <p className="font-medium">{profile?.full_name || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Email</p>
            <p className="font-medium">{profile?.email || user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Inscrit depuis</p>
            <p className="font-medium">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</p>
          </div>
        </div>
        <Separator />
        <Button variant="outline" onClick={handleLogout} className="text-destructive border-destructive/30 hover:bg-destructive/5">
          <LogOut className="h-4 w-4 mr-2" />
          Se déconnecter
        </Button>
      </div>

      {/* ───── 2. Offers ───── */}
      <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4 card-hover">
        <h2 className="text-lg text-accent font-serif font-normal">Mes offres</h2>
        <p className="text-sm text-muted-foreground">
          Définis tes offres pour calculer automatiquement tes objectifs de CA par trimestre.
        </p>

        {offers.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <span className="text-4xl">🎯</span>
            <p className="text-sm text-muted-foreground">Aucune offre configurée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {offers.map((offer) => (
              <div key={offer.id} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/30 transition-colors">
                <span className="text-xl shrink-0">{offer.emoji ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{offer.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs">{formatEur(offer.unit_price)}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      offer.billing_type === 'recurring_monthly'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {offer.billing_type === 'recurring_monthly' ? 'Récurrent' : 'Ponctuel'}
                    </span>
                    {offer.billing_type === 'recurring_monthly' && (
                      <span className="text-xs text-muted-foreground">
                        {offer.recurring_duration ? `${offer.recurring_duration} mois` : 'illimité'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setEditingOffer(offer); setOfferModalOpen(true); }}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Modifier"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Supprimer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[20px]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer "{offer.emoji} {offer.name}" ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette offre sera retirée de tes objectifs. Les objectifs trimestriels associés seront supprimés.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteOffer(offer.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" onClick={() => { setEditingOffer(null); setOfferModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Nouvelle offre
        </Button>
      </div>

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
                  Cette action supprimera <span className="font-medium text-foreground">toutes</span> tes transactions, factures, objectifs, comptes bancaires et catégories personnalisées. Les catégories et offres par défaut seront recréées. Cette action est irréversible.
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

      {/* Offer Modal */}
      <OfferModal
        open={offerModalOpen}
        onOpenChange={setOfferModalOpen}
        onSave={handleSaveOffer}
        offer={editingOffer}
      />
    </div>
  );
}
