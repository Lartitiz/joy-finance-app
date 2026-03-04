import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Invoice {
  id: string;
  client_name: string;
  description: string | null;
  amount: number;
  date_issued: string;
  date_due: string | null;
  status: string | null;
}

interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { client_name: string; description: string; amount: number; date_issued: string; date_due: string; status: string }) => void;
  invoice: Invoice | null;
  defaultDate: string;
}

const STATUSES = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent', label: 'Envoyée' },
  { value: 'paid', label: 'Payée' },
  { value: 'overdue', label: 'En retard' },
  { value: 'cancelled', label: 'Annulée' },
];

export function InvoiceModal({ open, onOpenChange, onSave, invoice, defaultDate }: InvoiceModalProps) {
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dateIssued, setDateIssued] = useState('');
  const [dateDue, setDateDue] = useState('');
  const [status, setStatus] = useState('draft');

  useEffect(() => {
    if (open) {
      if (invoice) {
        setClientName(invoice.client_name);
        setDescription(invoice.description ?? '');
        setAmount(invoice.amount.toString());
        setDateIssued(invoice.date_issued);
        setDateDue(invoice.date_due ?? '');
        setStatus(invoice.status ?? 'draft');
      } else {
        setClientName('');
        setDescription('');
        setAmount('');
        setDateIssued(defaultDate);
        setDateDue('');
        setStatus('draft');
      }
    }
  }, [open, invoice, defaultDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !amount || !dateIssued) return;
    onSave({
      client_name: clientName.trim(),
      description: description.trim(),
      amount: parseFloat(amount),
      date_issued: dateIssued,
      date_due: dateDue || dateIssued,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="font-serif font-normal text-accent">
            {invoice ? 'Modifier la facture' : 'Nouvelle facture'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="Nom du client" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mission, prestation…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Montant (€)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min={0} step={0.01} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring"
              >
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date d'émission</Label>
              <Input type="date" value={dateIssued} onChange={(e) => setDateIssued(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Date d'échéance</Label>
              <Input type="date" value={dateDue} onChange={(e) => setDateDue(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit">{invoice ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
