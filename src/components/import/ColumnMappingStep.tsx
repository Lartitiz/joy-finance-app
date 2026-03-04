import { RawRow, ColumnMapping } from '@/lib/import-utils';
import { Button } from '@/components/ui/button';

const MAPPING_OPTIONS: { value: ColumnMapping; label: string }[] = [
  { value: 'date', label: '📅 Date' },
  { value: 'label', label: '🏷️ Libellé' },
  { value: 'amount_single', label: '💰 Montant (unique)' },
  { value: 'amount_credit', label: '➕ Montant (crédit)' },
  { value: 'amount_debit', label: '➖ Montant (débit)' },
  { value: 'ignore', label: '⛔ Ignorer' },
];

interface ColumnMappingStepProps {
  headers: string[];
  previewRows: RawRow[];
  mapping: Record<string, ColumnMapping>;
  onMappingChange: (header: string, value: ColumnMapping) => void;
  onValidate: () => void;
}

export function ColumnMappingStep({
  headers,
  previewRows,
  mapping,
  onMappingChange,
  onValidate,
}: ColumnMappingStepProps) {
  const hasDate = Object.values(mapping).includes('date');
  const hasLabel = Object.values(mapping).includes('label');
  const hasAmount =
    Object.values(mapping).includes('amount_single') ||
    Object.values(mapping).includes('amount_credit') ||
    Object.values(mapping).includes('amount_debit');
  const isValid = hasDate && hasLabel && hasAmount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-accent">Mapping des colonnes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Associe chaque colonne à un champ. Date + Libellé + au moins un Montant sont requis.
        </p>
      </div>

      {/* Mapping selectors */}
      <div className="bg-card rounded-[20px] shadow-soft p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left pb-3 pr-4 min-w-[160px]">
                  <div className="space-y-2">
                    <span className="font-mono text-xs text-muted-foreground block truncate max-w-[180px]">{h}</span>
                    <select
                      value={mapping[h] ?? 'ignore'}
                      onChange={(e) => onMappingChange(h, e.target.value as ColumnMapping)}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:ring-2 focus:ring-ring"
                    >
                      {MAPPING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {previewRows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {headers.map((h) => (
                  <td key={h} className="py-2 pr-4 truncate max-w-[200px]">
                    {row[h]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Validation status */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className={`text-xs ${hasDate ? 'text-green-600' : 'text-muted-foreground'}`}>
          {hasDate ? '✓' : '○'} Date
        </span>
        <span className={`text-xs ${hasLabel ? 'text-green-600' : 'text-muted-foreground'}`}>
          {hasLabel ? '✓' : '○'} Libellé
        </span>
        <span className={`text-xs ${hasAmount ? 'text-green-600' : 'text-muted-foreground'}`}>
          {hasAmount ? '✓' : '○'} Montant
        </span>
        <div className="flex-1" />
        <Button onClick={onValidate} disabled={!isValid}>
          Valider le mapping
        </Button>
      </div>
    </div>
  );
}
