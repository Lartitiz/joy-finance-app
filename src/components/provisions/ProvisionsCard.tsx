import { PiggyBank, CalendarClock, Info } from 'lucide-react';
import { formatEur } from '@/lib/dashboard-utils';
import type { DeclarationSettings } from '@/lib/declaration-utils';
import type { Provisions, UrssafDeadline } from '@/lib/provision-utils';

const dateFr = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Carte « À mettre de côté » partagée par le tableau de bord et la Déclaration :
 * provisions (cotisations, TVA collectée), ce qui t'appartient vraiment, et
 * l'échéance URSSAF du trimestre.
 */
export function ProvisionsCard({ periodLabel, provisions, settings, deadline }: {
  periodLabel: string;
  provisions: Provisions;
  settings: DeclarationSettings;
  deadline: UrssafDeadline;
}) {
  const p = provisions;
  const showTva = !!settings.tvaStartDate || p.tva > 0;

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-accent">À mettre de côté · {periodLabel}</h2>
        <PiggyBank className="h-5 w-5 text-primary" />
      </div>
      <p className="text-3xl font-mono text-accent">{formatEur(p.total)}</p>
      <div className="space-y-1.5 text-sm">
        <Line label={`Cotisations sociales (${settings.socialRate} %)`} value={p.social} />
        {settings.cfpRate > 0 && (
          <Line label={`Formation professionnelle, CFP (${settings.cfpRate} %)`} value={p.cfp} />
        )}
        {settings.liberatoireEnabled && (
          <Line label={`Impôt, versement libératoire (${settings.liberatoireRate} %)`} value={p.liberatoire} />
        )}
        {showTva && (
          <Line label={`TVA collectée (${settings.tvaRate} %), à reverser`} value={p.tva} />
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-1.5 text-sm">
        <Line label="Encaissements" value={p.encaissements} />
        <Line label="Moins ce qui est à mettre de côté" value={-p.total} />
        <Line label="Moins les dépenses (hors rémunération)" value={-p.depenses} />
        <div className="flex items-center justify-between pt-2">
          <span className="text-accent font-medium">Vraiment à toi</span>
          <span className={`text-2xl font-mono ${p.aMoi >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatEur(p.aMoi)}</span>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-border p-4 text-sm">
        <CalendarClock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          <span className="text-muted-foreground">
            Échéance URSSAF du T{deadline.quarter} {deadline.year} {deadline.passed ? 'passée le' : ':'}{' '}
          </span>
          <span className="text-accent">{dateFr(deadline.dueDate)}</span>
          <span className="text-muted-foreground">, montant estimé </span>
          <span className="font-mono text-accent">{formatEur(deadline.amount)}</span>
        </p>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Estimation à partir de tes encaissements classés et des taux réglés dans Déclaration. Vérifie toujours le montant officiel affiché par l'URSSAF.
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-accent whitespace-nowrap">{formatEur(value)}</span>
    </div>
  );
}
