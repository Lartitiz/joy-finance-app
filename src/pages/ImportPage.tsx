import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  parseFile,
  autoMapColumns,
  applyMapping,
  splitDuplicates,
  dateSpan,
  ColumnMapping,
  RawRow,
  ParsedTransaction,
} from '@/lib/import-utils';
import { FileDropZone } from '@/components/import/FileDropZone';
import { ColumnMappingStep } from '@/components/import/ColumnMappingStep';
import { TransactionPreview } from '@/components/import/TransactionPreview';
import { ImportSuccess } from '@/components/import/ImportSuccess';

type Step = 'upload' | 'mapping' | 'preview' | 'success';

export default function ImportPage() {
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, ColumnMapping>>({});
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [split, setSplit] = useState<{ fresh: ParsedTransaction[]; dupes: ParsedTransaction[]; probables: ParsedTransaction[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  // Step 1: file selected
  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const { headers: h, rows } = await parseFile(file);
      if (rows.length === 0) {
        toast.error('Le fichier est vide ou ne contient aucune donnée.');
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setAllRows(rows);
      setMapping(autoMapColumns(h));
      setStep('mapping');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la lecture du fichier');
    }
  }, []);

  // Step 2: mapping validated
  const handleValidateMapping = useCallback(() => {
    const { transactions: txns, errors } = applyMapping(allRows, mapping);
    if (txns.length === 0) {
      toast.error('Aucune transaction valide détectée.');
      if (errors.length > 0) toast.error(errors.slice(0, 3).join('\n'));
      return;
    }
    if (errors.length > 0) {
      toast.warning(`${errors.length} ligne(s) ignorée(s) (format invalide)`);
    }
    setTransactions(txns);
    // Check duplicates
    checkDuplicates(txns);
  }, [allRows, mapping]);

  /**
   * Relit TOUTES les transactions déjà en base sur la période du fichier.
   * Supabase plafonne une réponse à 1 000 lignes : sans pagination,
   * l'anti-doublon ne voyait qu'une partie de la base.
   */
  const fetchExisting = async (txns: ParsedTransaction[]) => {
    const span = dateSpan(txns);
    if (!user || !span) return [];
    const PAGE = 1000;
    let all: { date: string; label: string; amount: number }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('transactions')
        .select('date, label, amount')
        .eq('user_id', user.id)
        .gte('date', span.start)
        .lte('date', span.end)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all = all.concat(data ?? []);
      if ((data?.length ?? 0) < PAGE) break;
    }
    return all;
  };

  const checkDuplicates = async (txns: ParsedTransaction[]) => {
    if (!user) return;
    try {
      const existing = await fetchExisting(txns);
      setSplit(splitDuplicates(txns, existing));
      setStep('preview');
    } catch (err: unknown) {
      // Sans la liste existante, on ne peut pas garantir l'absence de doublons :
      // on bloque plutôt que d'importer à l'aveugle.
      toast.error(`Impossible de vérifier les doublons : ${(err as { message?: string })?.message ?? 'erreur inconnue'}`);
    }
  };

  // Step 3: import
  const handleImport = async (includeProbables: boolean) => {
    if (!user) return;
    setImporting(true);

    try {
      // Relecture juste avant l'écriture : la base a pu changer depuis l'aperçu
      // (autre onglet, double clic).
      const latest = splitDuplicates(transactions, await fetchExisting(transactions));
      const txnsToImport = includeProbables ? [...latest.fresh, ...latest.probables] : latest.fresh;

      if (txnsToImport.length === 0) {
        toast.info('Toutes les transactions sont des doublons. Rien à importer.');
        setImporting(false);
        return;
      }

      // Create batch
      const { data: batch, error: batchErr } = await supabase
        .from('import_batches')
        .insert({
          user_id: user.id,
          filename: fileName,
          row_count: txnsToImport.length,
          status: 'processing',
        })
        .select('id')
        .single();

      if (batchErr || !batch) throw batchErr;

      // Insert transactions in chunks of 500
      const CHUNK_SIZE = 500;
      for (let i = 0; i < txnsToImport.length; i += CHUNK_SIZE) {
        const chunk = txnsToImport.slice(i, i + CHUNK_SIZE).map((t) => ({
          user_id: user.id,
          date: t.date,
          label: t.label,
          amount: t.amount,
          source: 'import' as const,
          is_validated: false,
          import_batch_id: batch.id,
        }));

        const { error } = await supabase.from('transactions').insert(chunk);
        if (error) throw error;
      }

      // Update batch status
      await supabase
        .from('import_batches')
        .update({ status: 'completed' })
        .eq('id', batch.id);

      setImportedCount(txnsToImport.length);
      setStep('success');
      toast.success(`${txnsToImport.length} transactions importées !`);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setAllRows([]);
    setMapping({});
    setTransactions([]);
    setSplit(null);
    setImportedCount(0);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <h1 className="text-2xl text-accent">Import</h1>

      {step === 'upload' && <FileDropZone onFileSelect={handleFileSelect} />}

      {step === 'mapping' && (
        <ColumnMappingStep
          headers={headers}
          previewRows={allRows.slice(0, 5)}
          mapping={mapping}
          onMappingChange={(h, v) => setMapping((prev) => ({ ...prev, [h]: v }))}
          onValidate={handleValidateMapping}
        />
      )}

      {step === 'preview' && split && (
        <TransactionPreview
          transactions={transactions}
          freshCount={split.fresh.length}
          dupes={split.dupes}
          probables={split.probables}
          onImport={handleImport}
          importing={importing}
        />
      )}

      {step === 'success' && (
        <ImportSuccess count={importedCount} onReset={reset} />
      )}
    </div>
  );
}
