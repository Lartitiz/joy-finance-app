import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { formatEur } from '@/lib/dashboard-utils';
import { todayIso } from '@/lib/provision-utils';
import type { Invoice } from '@/lib/invoice-utils';
import { groupByClient, URGENT_LATE_DAYS, REMINDER_COOLDOWN_DAYS, type ClientReminder } from '@/lib/reminder-utils';

const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** « À relancer » : un bloc par client qui doit encore de l'argent. Rien n'est envoyé aux clients. */
export default function RelancesParClient({ invoices }: { invoices: Invoice[] }) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ClientReminder[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('client_reminders')
      .select('client_name, reminded_at')
      .eq('user_id', user.id);
    if (error) toast.error(error.message);
    else setReminders(data ?? []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const today = todayIso();
  const clients = groupByClient(invoices, reminders, today);
  if (clients.length === 0) return null;

  const markReminded = async (name: string) => {
    if (!user) return;
    setSaving(name);
    const { error } = await supabase
      .from('client_reminders')
      .upsert({ user_id: user.id, client_name: name, reminded_at: today }, { onConflict: 'user_id,client_name' });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${name} : relance notée`);
    load();
  };

  return (
    <div className="bg-card rounded-[20px] shadow-soft p-5 space-y-3">
      <h2 className="text-lg text-accent">À relancer</h2>
      <div className="space-y-2">
        {clients.map(c => (
          <div key={c.key}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border p-3 text-sm ${c.urgent ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
            <div className="flex-1 min-w-[160px]">
              <p className="text-accent">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.count} facture{c.count > 1 ? 's' : ''}
                {c.maxDaysLate > 0 && <> · <span className={c.urgent ? 'text-destructive' : ''}>{c.maxDaysLate} j de retard</span></>}
                {c.lastReminder && <> · relancé le {dayMonth(c.lastReminder)}</>}
              </p>
            </div>
            <span className="font-mono text-accent whitespace-nowrap">{formatEur(c.total)}</span>
            {c.total > 0 ? (
              <Button size="sm" variant={c.urgent ? 'default' : 'outline'} disabled={saving === c.name || c.lastReminder === today}
                onClick={() => markReminded(c.name)}>
                {c.lastReminder === today ? 'Relancé aujourd\'hui ✓' : 'Relancé aujourd\'hui'}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Avoir, rien à relancer</span>
            )}
          </div>
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        En haut et en couleur : plus de {URGENT_LATE_DAYS} jours de retard et pas relancé depuis {REMINDER_COOLDOWN_DAYS} jours. Rien n'est envoyé à tes clients : tu notes juste la date de ta relance.
      </p>
    </div>
  );
}
