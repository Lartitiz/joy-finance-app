/**
 * « À relancer » : factures non payées regroupées par client. Aide-mémoire :
 * rien n'est envoyé aux clients, on garde seulement la date de dernière relance
 * (table client_reminders, que la synchronisation Indy ne touche pas).
 */
import { addDays, daysLate, isUnpaid, type Invoice } from './invoice-utils';

/** Plus de 30 jours de retard et pas relancé depuis 15 jours (ou jamais) : à mettre en avant. */
export const URGENT_LATE_DAYS = 30;
export const REMINDER_COOLDOWN_DAYS = 15;

/** Même client malgré une casse ou des espaces différents. */
export const clientKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export interface ClientReminder {
  client_name: string;
  reminded_at: string;   // AAAA-MM-JJ
}

export interface ClientToRemind {
  key: string;
  name: string;
  /** Somme TTC, avoirs (montants négatifs) compris, comme Indy. */
  total: number;
  count: number;
  /** Plus grand retard en jours parmi ses factures non payées. */
  maxDaysLate: number;
  lastReminder: string | null;
  urgent: boolean;
}

export function groupByClient(invoices: Invoice[], reminders: ClientReminder[], today: string): ClientToRemind[] {
  const lastByKey = new Map<string, string>();
  for (const r of reminders) {
    const k = clientKey(r.client_name);
    const prev = lastByKey.get(k);
    if (!prev || r.reminded_at > prev) lastByKey.set(k, r.reminded_at);
  }

  const groups = new Map<string, ClientToRemind>();
  for (const inv of invoices.filter(isUnpaid)) {
    const k = clientKey(inv.client_name);
    const g = groups.get(k) ?? {
      key: k, name: inv.client_name.trim(), total: 0, count: 0, maxDaysLate: 0,
      lastReminder: lastByKey.get(k) ?? null, urgent: false,
    };
    g.total = Math.round((g.total + inv.amount) * 100) / 100;
    g.count += 1;
    // Un avoir ne se relance pas : son « retard » ne compte pas.
    if (inv.amount > 0) g.maxDaysLate = Math.max(g.maxDaysLate, daysLate(inv, today));
    groups.set(k, g);
  }

  const cooldownStart = addDays(today, -REMINDER_COOLDOWN_DAYS);
  const list = [...groups.values()].map(g => ({
    ...g,
    urgent: g.total > 0 && g.maxDaysLate > URGENT_LATE_DAYS
      && (g.lastReminder === null || g.lastReminder <= cooldownStart),
  }));
  return list.sort((a, b) =>
    Number(b.urgent) - Number(a.urgent)
    || b.maxDaysLate - a.maxDaysLate
    || b.total - a.total
    || a.name.localeCompare(b.name, 'fr'));
}
