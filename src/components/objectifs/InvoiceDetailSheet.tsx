import { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatEur } from '@/lib/dashboard-utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { CheckCircle, Trash2 } from 'lucide-react';

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

const STATUSES = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent', label: 'Envoyée' },
  { value: 'paid', label: 'Payée' },
  { value: 'overdue', label: 'En retard' },
  { value: 'cancelled', label: 'Annulée' },
];

const statusBadge = (status: string | null) => {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Brouillon', cls: 'bg-muted text-muted-foreground' },
    sent: { label: 'Envoyée', cls: 'bg-secondary text-secondary-foreground' },
    paid: { label: 'Payée', cls: 'bg-green-100 text-green-700' },
    overdue: { label: 'En retard', cls: 'bg-destructive/10 text-destructive' },
    cancelled: { label: 'Annulée', cls: 'bg-muted text-muted-foreground' },
  };
  const s = map[status ?? 'draft'] ?? map.draft;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
};

interface InvoiceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onSave: (data: { client_name: string; description: string; amount: number; date_issued: string; date_due: string; status: string; paid_date: string | null }) => void;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
}

export function InvoiceDetailSheet({ open, onOpenChange, invoice, onSave, onDelete, onMarkPaid }: InvoiceDetailSheetProps) {
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dateIssued, setDateIssued] = useState('');
  const [dateDue, setDateDue] = useState('');
  const [status, setStatus] = useState('draft');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setClientName(invoice.client_name);
      setDescription(invoice.description ?? '');
      setAmount(invoice.amount.toString());
      setDateIssued(invoice.date_issued);
      setDateDue(invoice.date_due ?? '');
      setStatus(invoice.status ?? 'draft');
      setDirty(false);
    }
  }, [open, invoice]);

  const markDirty = () => setDirty(true);

  const handleSave = () => {
    if (!invoice || !clientName.trim() || !amount) return;
    onSave({
      client_name: clientName.trim(),
      description: description.trim(),
      amount: parseFloat(amount),
      date_issued: dateIssued,
      date_due: dateDue || dateIssued,
      status,
      paid_date: status === 'paid' ? (invoice.paid_date ?? new Date().toISOString().slice(0, 10)) : null,
    });
    setDirty(false);
  };

  if (!invoice) return null;

  const isOverdue = invoice.date_due && new Date(invoice.date_due) < new Date() && invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const canMarkPaid = status === 'sent' || status === 'overdue';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="font-serif font-normal text-accent flex items-center gap-2">
            Facture {statusBadge(status)}
          </SheetTitle>
          {isOverdue && (
            <p className="text-xs text-destructive font-medium">⚠️ Échue depuis le {new Date(invoice.date_due!).toLocaleDateString('fr-FR')}</p>
          )}
        </SheetHeader>

        <div className="space-y-4 py-2">
          {/* Amount display */}
          <div className="bg-muted/50 rounded-2xl p-4 text-center">
            <p className="text-3xl font-mono font-medium">{formatEur(invoice.amount)}</p>
            {invoice.paid_date && (
              <p className="text-xs text-muted-foreground mt-1">Payée le {new Date(invoice.paid_date).toLocaleDateString('fr-FR')}</p>
            )}
          </div>

          {/* Mark as paid */}
          {canMarkPaid && (
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => { onMarkPaid(invoice.id); onOpenChange(false); }}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Marquer comme payée
            </Button>
          )}

          {/* Editable fields */}
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input value={clientName} onChange={(e) => { setClientName(e.target.value); markDirty(); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }} placeholder="Mission, prestation…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Montant (€)</Label>
              <Input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); markDirty(); }} min={0} step={0.01} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); markDirty(); }}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring"
              >
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date d'émission</Label>
              <Input type="date" value={dateIssued} onChange={(e) => { setDateIssued(e.target.value); markDirty(); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Date d'échéance</Label>
              <Input type="date" value={dateDue} onChange={(e) => { setDateDue(e.target.value); markDirty(); }} />
            </div>
          </div>

          {/* Last update info */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            Créée le {new Date(invoice.date_issued).toLocaleDateString('fr-FR')}
            {invoice.paid_date && ` · Payée le ${new Date(invoice.paid_date).toLocaleDateString('fr-FR')}`}
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 pt-4">
          {dirty && (
            <Button onClick={handleSave} className="w-full">
              Enregistrer les modifications
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer cette facture
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[20px]">
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer cette facture ?</AlertDialogTitle>
                <AlertDialogDescription>
                  La facture de {formatEur(invoice.amount)} pour {invoice.client_name} sera supprimée définitivement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { onDelete(invoice.id); onOpenChange(false); }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
