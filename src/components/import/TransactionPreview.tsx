import { ParsedTransaction } from '@/lib/import-utils';
import { Button } from '@/components/ui/button';

interface TransactionPreviewProps {
  transactions: ParsedTransaction[];
  freshCount: number;
  dupes: ParsedTransaction[];
  probables: ParsedTransaction[];
  /** includeProbables : importer aussi les doublons probables (libellé différent). */
  onImport: (includeProbables: boolean) => void;
  importing: boolean;
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export function TransactionPreview({
  transactions,
  freshCount,
  dupes,
  probables,
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

      {/* Doublons : jamais réimportés ; doublons probables : montrés, écartés par défaut */}
      {(dupes.length > 0 || probables.length > 0) && (
        <div className="bg-secondary/40 rounded-[20px] p-4 flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div className="space-y-3 min-w-0">
            {dupes.length > 0 && (
              <p className="text-sm font-medium">
                {dupes.length} transaction{dupes.length > 1 ? 's sont' : ' est'} déjà dans ton compte : {dupes.length > 1 ? 'elles ne seront pas réimportées' : 'elle ne sera pas réimportée'}.
              </p>
            )}
            {probables.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {probables.length} doublon{probables.length > 1 ? 's' : ''} probable{probables.length > 1 ? 's' : ''} : même date et même montant qu'une transaction déjà enregistrée, avec un libellé différent. {probables.length > 1 ? 'Ils sont écartés' : 'Il est écarté'} sauf si tu choisis de {probables.length > 1 ? 'les ' : "l'"}importer.
                </p>
                <ul className="text-xs font-mono space-y-1 max-h-40 overflow-auto">
                  {probables.map((t, i) => (
                    <li key={i} className="truncate">
                      {t.date} · {t.amount >= 0 ? '+' : ''}{fmt(t.amount)} € · <span className="font-sans">{t.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

      <div className="flex flex-wrap justify-end gap-2">
        {probables.length > 0 && (
          <Button size="lg" variant="ghost" onClick={() => onImport(true)} disabled={importing}>
            Importer aussi les {probables.length} probable{probables.length > 1 ? 's' : ''}
          </Button>
        )}
        <Button size="lg" onClick={() => onImport(false)} disabled={importing || freshCount === 0}>
          {importing
            ? 'Import en cours…'
            : freshCount === 0
              ? 'Rien de nouveau à importer'
              : `Importer ${freshCount} nouvelle${freshCount > 1 ? 's' : ''} transaction${freshCount > 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}
