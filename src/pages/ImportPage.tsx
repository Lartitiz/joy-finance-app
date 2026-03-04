import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  parseFile,
  autoMapColumns,
  applyMapping,
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
  const [duplicateCount, setDuplicateCount] = useState(0);
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

  const checkDuplicates = async (txns: ParsedTransaction[]) => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from('transactions')
        .select('date, label, amount')
        .eq('user_id', user.id);

      if (existing && existing.length > 0) {
        const existingSet = new Set(
          existing.map((e) => `${e.date}|${e.label}|${e.amount}`)
        );
        const dupes = txns.filter(
          (t) => existingSet.has(`${t.date}|${t.label}|${t.amount}`)
        ).length;
        setDuplicateCount(dupes);
      } else {
        setDuplicateCount(0);
      }
    } catch {
      setDuplicateCount(0);
    }
    setStep('preview');
  };

  // Step 3: import
  const handleImport = async (skipDuplicates: boolean) => {
    if (!user) return;
    setImporting(true);

    try {
      let txnsToImport = transactions;

      if (skipDuplicates && duplicateCount > 0) {
        const { data: existing } = await supabase
          .from('transactions')
          .select('date, label, amount')
          .eq('user_id', user.id);

        if (existing) {
          const existingSet = new Set(
            existing.map((e) => `${e.date}|${e.label}|${e.amount}`)
          );
          txnsToImport = transactions.filter(
            (t) => !existingSet.has(`${t.date}|${t.label}|${t.amount}`)
          );
        }
      }

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
    setDuplicateCount(0);
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

      {step === 'preview' && (
        <TransactionPreview
          transactions={transactions}
          duplicateCount={duplicateCount}
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
