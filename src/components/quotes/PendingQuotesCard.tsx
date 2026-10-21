import { useEffect, useState } from 'react';
import { ChevronDown, FileSignature } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { formatEur } from '@/lib/dashboard-utils';
import { computePendingQuotes, daysSinceIssued, type Quote } from '@/lib/quote-utils';

const dateFr = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

const issuedAgo = (q: Quote, today: string) => {
  const d = daysSinceIssued(q, today);
  return d === 0 ? "émis aujourd'hui" : `émis il y a ${plural(d, 'jour')}`;
};

/**
 * Carte « Devis en attente » du tableau de bord : devis Indy (table quotes)
 * qui peuvent encore être signés, devis signés à facturer, et ceux expirés
 * sans réponse. Lecture seule.
 */
export function PendingQuotesCard({ userId, today }: { userId: string; today: string }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  useEffect(() => {
    supabase.from('quotes').select('id, number, client_name, title, amount, date_issued, date_expires, status')
      .eq('user_id', userId)
      .then(({ data }) => setQuotes((data ?? []) as Quote[]));
  }, [userId]);

  // Aucun devis synchronisé : rien à montrer.
  if (!quotes || quotes.length === 0) return null;

  const { pending, expired, signed } = computePendingQuotes(quotes, today);

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-4">
      <h2 className="text-lg text-accent">Devis en attente</h2>

      {signed.count > 0 && (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 space-y-1.5 text-sm">
          <p className="flex items-center gap-2 font-medium text-accent">
            <FileSignature className="w-4 h-4 text-primary" />
            Signés, à facturer : <span className="font-mono">{formatEur(signed.total)}</span>
          </p>
          {signed.quotes.map(q => (
            <div key={q.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{q.client_name} · {q.number}</span>
              <span className="font-mono text-accent whitespace-nowrap">{formatEur(q.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-sm text-muted-foreground">Peut encore être signé</p>
        <p className="text-2xl font-mono text-accent">{formatEur(pending.total)}</p>
        <p className="text-xs text-muted-foreground">{pending.count} devis</p>
      </div>

      {pending.count > 0 && (
        <div className="border-t border-border pt-3 space-y-2 text-sm">
          {pending.quotes.map(q => (
            <div key={q.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate">{q.client_name} · {q.number}</p>
                <p className="text-xs text-muted-foreground">
                  {issuedAgo(q, today)}{q.date_expires ? `, expire le ${dateFr(q.date_expires)}` : ''}
                </p>
              </div>
              <span className="font-mono text-accent whitespace-nowrap">{formatEur(q.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {expired.count > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-accent">
            {expired.count} devis expiré{expired.count > 1 ? 's' : ''} sans réponse ({formatEur(expired.total)})
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-1.5 text-xs text-muted-foreground">
            {expired.quotes.map(q => (
              <div key={q.id} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {q.client_name} · {q.number}{q.date_expires ? `, expiré le ${dateFr(q.date_expires)}` : ''}
                </span>
                <span className="font-mono whitespace-nowrap">{formatEur(q.amount)}</span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
