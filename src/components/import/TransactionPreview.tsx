import { ParsedTransaction } from '@/lib/import-utils';
import { Button } from '@/components/ui/button';

interface TransactionPreviewProps {
  transactions: ParsedTransaction[];
  duplicateCount: number;
  onImport: (skipDuplicates: boolean) => void;
  importing: boolean;
}

export function TransactionPreview({
  transactions,
  duplicateCount,
  onImport,
  importing,
}: TransactionPreviewProps) {
  const totalRevenue = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-accent">Aperçu des transactions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {transactions.length} transactions détectées
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-[20px] shadow-soft p-5 text-center">
          <p className="text-xs text-muted-foreground">Transactions</p>
          <p className="text-2xl font-mono mt-1">{transactions.length}</p>
        </div>
        <div className="bg-card rounded-[20px] shadow-soft p-5 text-center">
          <p className="text-xs text-muted-foreground">Revenus</p>
          <p className="text-2xl font-mono mt-1 text-green-600">
            +{totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
          </p>
        </div>
        <div className="bg-card rounded-[20px] shadow-soft p-5 text-center">
          <p className="text-xs text-muted-foreground">Dépenses</p>
          <p className="text-2xl font-mono mt-1 text-destructive">
            -{totalExpense.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
          </p>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicateCount > 0 && (
        <div className="bg-secondary/40 rounded-[20px] p-4 flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {duplicateCount} transaction{duplicateCount > 1 ? 's semblent' : ' semble'} déjà exister
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onImport(true)} disabled={importing}>
                Ignorer les doublons
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onImport(false)} disabled={importing}>
                Tout importer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction table */}
      <div className="bg-card rounded-[20px] shadow-soft overflow-hidden">
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Date</th>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Libellé</th>
                <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Montant</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {transactions.slice(0, 100).map((t, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-5 py-2.5">{t.date}</td>
                  <td className="px-5 py-2.5 font-sans max-w-[300px] truncate">{t.label}</td>
                  <td className={`px-5 py-2.5 text-right ${t.amount >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {t.amount >= 0 ? '+' : ''}
                    {t.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length > 100 && (
          <p className="text-center text-xs text-muted-foreground py-3">
            … et {transactions.length - 100} autres transactions
          </p>
        )}
      </div>

      {/* Import button (when no duplicates) */}
      {duplicateCount === 0 && (
        <div className="flex justify-end">
          <Button size="lg" onClick={() => onImport(false)} disabled={importing}>
            {importing ? 'Import en cours…' : `Importer ${transactions.length} transactions`}
          </Button>
        </div>
      )}
    </div>
  );
}
