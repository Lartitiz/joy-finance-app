// Ce que la synchronisation vient de changer, en langage courant, pour l'e-mail du lundi.
import type { ChangeLine, WeekChanges } from '../../../src/lib/digest-utils.ts';
import type { InvoiceRow, QuoteRow } from './format.ts';

/** Réponse de la fonction indy_sync de l'app. */
export interface SyncResult {
  factures: {
    nouvelles: InvoiceRow[];
    mises_a_jour: { number: string; avant: Record<string, unknown>; apres: Record<string, unknown> }[];
    inchangees: number;
    ecarts: { number: string; ecart: string }[];
  };
  devis: {
    nouveaux: QuoteRow[];
    mis_a_jour: { number: string; avant: string; apres: string }[];
    inchanges: number;
  };
}

const SIGNED = new Set(['signed', 'invoiced']);
const CLOSED = new Set(['refused', 'cancelled']);

/** Trie les changements de la synchro ; `invoices` et `quotes` = ce qui a été lu dans Indy (client, montant). */
export function weekChanges(r: SyncResult, invoices: InvoiceRow[], quotes: QuoteRow[], since: string | null): WeekChanges {
  const inv = new Map(invoices.map(i => [i.number, i]));
  const quo = new Map(quotes.map(q => [q.number, q]));
  const fromInvoice = (number: string, note?: string): ChangeLine => {
    const i = inv.get(number);
    return { number, client_name: i?.client_name ?? '?', amount: i?.amount ?? 0, ...(note ? { note } : {}) };
  };
  const fromQuote = (number: string, note?: string): ChangeLine => {
    const q = quo.get(number);
    return { number, client_name: q?.client_name ?? '?', amount: q?.amount ?? 0, title: q?.title ?? null, ...(note ? { note } : {}) };
  };
  const c: WeekChanges = {
    since, paid: [], invoiced: [], creditNotes: [], cancelledInvoices: [],
    newQuotes: [], signedQuotes: [], refusedQuotes: [],
    gaps: r.factures.ecarts.map(e => `facture ${e.number} : ${e.ecart}`),
  };

  for (const i of r.factures.nouvelles) {
    if (i.status === 'cancelled') c.cancelledInvoices.push(fromInvoice(i.number, 'nouvelle, déjà annulée'));
    else if (i.amount < 0) c.creditNotes.push(fromInvoice(i.number));
    else c.invoiced.push(fromInvoice(i.number, i.status === 'paid' ? 'déjà payée' : undefined));
  }
  for (const u of r.factures.mises_a_jour) {
    const before = u.avant.status;
    const after = u.apres.status;
    if (after === before) continue;
    const line = fromInvoice(u.number);
    if (after === 'paid' && line.amount >= 0) c.paid.push(line);
    else if (after === 'cancelled') c.cancelledInvoices.push(line);
  }

  for (const q of r.devis.nouveaux) {
    if (SIGNED.has(q.status)) c.signedQuotes.push(fromQuote(q.number, q.status === 'invoiced' ? 'nouveau, déjà facturé' : 'nouveau'));
    else if (CLOSED.has(q.status)) c.refusedQuotes.push(fromQuote(q.number, 'nouveau'));
    else c.newQuotes.push(fromQuote(q.number, q.status === 'expired' ? 'déjà expiré' : undefined));
  }
  for (const u of r.devis.mis_a_jour) {
    if (SIGNED.has(u.apres) && !SIGNED.has(u.avant)) {
      c.signedQuotes.push(fromQuote(u.number, u.apres === 'invoiced' ? 'déjà facturé' : undefined));
    } else if (CLOSED.has(u.apres) && !CLOSED.has(u.avant)) {
      c.refusedQuotes.push(fromQuote(u.number, u.apres === 'cancelled' ? 'annulé' : undefined));
    }
  }
  return c;
}
