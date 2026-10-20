import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Upload, Pencil, Info } from 'lucide-react';
import { formatEur } from '@/lib/dashboard-utils';
import { todayIso } from '@/lib/provision-utils';
import {
  computeReceivables, daysLate, effectiveDueDate, isPaid, parseInvoicesCsv,
  type Invoice, type ParsedInvoiceFile,
} from '@/lib/invoice-utils';

const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR');

interface FormState {
  number: string;
  client_name: string;
  amount: string;
  date_issued: string;
  date_due: string;
  paid: boolean;
}

const emptyForm = (): FormState => ({
  number: '', client_name: '', amount: '', date_issued: todayIso(), date_due: '', paid: false,
});

export default function FacturesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaid, setShowPaid] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedInvoiceFile | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('date_issued', { ascending: false });
    if (error) toast.error(error.message);
    // Brouillons et factures annulées ne sont pas des factures émises à encaisser.
    setInvoices(((data ?? []) as Invoice[]).filter(i => i.status !== 'draft' && i.status !== 'cancelled'));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const today = todayIso();
  const rec = computeReceivables(invoices, today);
  const shown = showPaid ? invoices : invoices.filter(i => !isPaid(i));

  const openModal = (inv?: Invoice) => {
    setEditing(inv ?? null);
    setForm(inv ? {
      number: inv.number ?? '', client_name: inv.client_name, amount: String(inv.amount),
      date_issued: inv.date_issued, date_due: inv.date_due ?? '', paid: isPaid(inv),
    } : emptyForm());
    setModalOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (!form.client_name.trim() || !Number.isFinite(amount) || !form.date_issued) {
      toast.error('Client, montant et date d\'émission sont obligatoires');
      return;
    }
    const payload = {
      number: form.number.trim() || null,
      client_name: form.client_name.trim(),
      amount,
      date_issued: form.date_issued,
      date_due: form.date_due || null,
      status: form.paid ? 'paid' : 'sent',
      paid_date: form.paid ? (editing?.paid_date ?? today) : null,
    };
    const { error } = editing
      ? await supabase.from('invoices').update(payload).eq('id', editing.id)
      : await supabase.from('invoices').insert({ ...payload, user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? 'Facture mise à jour' : 'Facture ajoutée');
    setModalOpen(false);
    load();
  };

  const remove = async () => {
    if (!editing) return;
    const { error } = await supabase.from('invoices').delete().eq('id', editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Facture supprimée');
    setModalOpen(false);
    load();
  };

  const togglePaid = async (inv: Invoice) => {
    const paid = !isPaid(inv);
    const { error } = await supabase.from('invoices')
      .update({ status: paid ? 'paid' : 'sent', paid_date: paid ? today : null })
      .eq('id', inv.id);
    if (error) toast.error(error.message);
    else load();
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setParsed(parseInvoicesCsv(text));
  };

  // Une facture déjà enregistrée (même numéro, ou même client + date + montant sans numéro) n'est pas réimportée.
  const known = new Set(invoices.map(i => i.number ?? `${i.client_name}|${i.date_issued}|${i.amount}`));
  const toImport = (parsed?.rows ?? []).filter(r => !known.has(r.number ?? `${r.client_name}|${r.date_issued}|${r.amount}`));

  const runImport = async () => {
    if (!user || toImport.length === 0) return;
    setImporting(true);
    const { error } = await supabase.from('invoices').insert(toImport.map(r => ({
      user_id: user.id,
      number: r.number,
      client_name: r.client_name,
      amount: r.amount,
      date_issued: r.date_issued,
      date_due: r.date_due,
      status: r.paid ? 'paid' : 'sent',
      paid_date: null,
    })));
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toImport.length} facture${toImport.length > 1 ? 's' : ''} importée${toImport.length > 1 ? 's' : ''}`);
    setParsed(null);
    load();
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl text-accent">Factures</h1>
          <p className="text-sm text-muted-foreground">Tes factures émises et ce qui reste à encaisser.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Importer un CSV
          </Button>
          <Button size="sm" onClick={() => openModal()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une facture
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </div>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card rounded-[20px] shadow-soft p-5">
          <p className="text-sm text-muted-foreground mb-2">À encaisser</p>
          <p className="text-3xl font-mono font-medium text-accent">{formatEur(rec.unpaidTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">{rec.unpaidCount} facture{rec.unpaidCount > 1 ? 's' : ''} non payée{rec.unpaidCount > 1 ? 's' : ''}</p>
        </div>
        <div className="bg-card rounded-[20px] shadow-soft p-5">
          <p className="text-sm text-muted-foreground mb-2">Dont en retard</p>
          <p className={`text-3xl font-mono font-medium ${rec.lateTotal > 0 ? 'text-destructive' : 'text-accent'}`}>{formatEur(rec.lateTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">{rec.lateCount} facture{rec.lateCount > 1 ? 's' : ''} après la date d'échéance</p>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg text-accent">{showPaid ? 'Toutes les factures' : 'Non payées'}</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showPaid} onCheckedChange={setShowPaid} /> Voir aussi les payées
          </label>
        </div>
        {loading ? (
          <div className="h-[120px] animate-pulse rounded-2xl bg-muted/50" />
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {invoices.length === 0 ? 'Aucune facture pour l\'instant. Ajoute-la à la main ou importe un CSV.' : 'Tout est encaissé.'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {shown.map(inv => {
              const late = daysLate(inv, today);
              return (
                <div key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-accent">{inv.client_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.number ? `${inv.number} · ` : ''}émise le {dateFr(inv.date_issued)} · échéance {dateFr(effectiveDueDate(inv))}
                    </p>
                  </div>
                  {late > 0 && <span className="text-xs text-destructive font-mono">{late} j de retard</span>}
                  <span className="font-mono text-accent whitespace-nowrap">{formatEur(inv.amount)}</span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={isPaid(inv)} onCheckedChange={() => togglePaid(inv)} /> Payée
                  </label>
                  <button onClick={() => openModal(inv)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Modifier la facture">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Sans date d'échéance, on compte 30 jours après l'émission. Rien n'est envoyé à tes clients : c'est juste pour voir.
        </p>
      </div>

      {/* Fenêtre facture */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-serif font-normal text-accent">{editing ? 'Modifier la facture' : 'Nouvelle facture'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Numéro</Label>
                <Input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder="F202610-32" />
              </div>
              <div className="space-y-1.5">
                <Label>Montant TTC (€)</Label>
                <Input type="number" step={0.01} className="font-mono" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Émise le</Label>
                <Input type="date" value={form.date_issued} onChange={e => setForm({ ...form, date_issued: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Échéance</Label>
                <Input type="date" value={form.date_due} onChange={e => setForm({ ...form, date_due: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center justify-between rounded-2xl border border-border p-3 text-sm">
              Payée
              <Switch checked={form.paid} onCheckedChange={v => setForm({ ...form, paid: v })} />
            </label>
          </div>
          <DialogFooter className="gap-2">
            {editing && (
              <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto" onClick={remove}>
                Supprimer
              </Button>
            )}
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editing ? 'Enregistrer' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relecture de l'import */}
      <Dialog open={parsed !== null} onOpenChange={o => { if (!o) setParsed(null); }}>
        <DialogContent className="sm:max-w-lg rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-serif font-normal text-accent">Importer des factures</DialogTitle>
          </DialogHeader>
          {parsed && parsed.missing.length > 0 ? (
            <p className="text-sm">
              Je ne trouve pas ces colonnes dans le fichier : <strong>{parsed.missing.join(', ')}</strong>.
              Il faut au moins une colonne client, une colonne montant (TTC de préférence) et une date d'émission.
            </p>
          ) : parsed && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Colonnes lues :</p>
                <p className="font-mono">
                  {[parsed.columns.number && `numéro = ${parsed.columns.number}`,
                    `client = ${parsed.columns.client}`, `montant = ${parsed.columns.amount}`,
                    `émission = ${parsed.columns.dateIssued}`,
                    parsed.columns.dateDue && `échéance = ${parsed.columns.dateDue}`,
                    parsed.columns.status && `statut = ${parsed.columns.status}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p>
                <span className="font-mono">{toImport.length}</span> nouvelle{toImport.length > 1 ? 's' : ''} facture{toImport.length > 1 ? 's' : ''} à importer
                {parsed.rows.length > toImport.length && <>, <span className="font-mono">{parsed.rows.length - toImport.length}</span> déjà dans l'app</>}
                {parsed.skipped > 0 && <>, <span className="font-mono">{parsed.skipped}</span> ligne{parsed.skipped > 1 ? 's' : ''} illisible{parsed.skipped > 1 ? 's' : ''} ignorée{parsed.skipped > 1 ? 's' : ''}</>}.
              </p>
              <div className="max-h-[220px] overflow-y-auto divide-y divide-border rounded-2xl border border-border">
                {toImport.slice(0, 50).map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="truncate">{r.number ? `${r.number} · ` : ''}{r.client_name} · {dateFr(r.date_issued)}</span>
                    <span className="font-mono whitespace-nowrap">{formatEur(r.amount)} {r.paid ? '· payée' : ''}</span>
                  </div>
                ))}
              </div>
              {!parsed.columns.status && (
                <p className="text-xs text-muted-foreground">Pas de colonne de statut : toutes sont importées comme non payées, à cocher ensuite.</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setParsed(null)}>Annuler</Button>
            {parsed && parsed.missing.length === 0 && (
              <Button onClick={runImport} disabled={importing || toImport.length === 0}>
                Importer {toImport.length} facture{toImport.length > 1 ? 's' : ''}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
