/**
 * E-mail du lundi envoyé à Laetitia après la synchronisation Indy
 * (tools/indy-sync) : ce qu'il y a à faire, ce qui a changé dans Indy, où elle
 * en est. Aide-mémoire : rien n'est envoyé aux clients. Mêmes règles que la
 * page Factures (« À relancer ») et le bloc « Devis en attente ».
 * Remplace le bilan mensuel du 1er depuis le 26/10/2026.
 */
import type { Invoice } from './invoice-utils';
import { addDays, computeReceivables, effectiveDueDate, isUnpaid } from './invoice-utils';
import { groupByClient, type ClientReminder } from './reminder-utils';
import { computePendingQuotes, daysSinceIssued, type Quote } from './quote-utils';

/** Un devis en attente envoyé depuis 15 jours sans réponse est à relancer. */
export const QUOTE_FOLLOW_UP_DAYS = 15;
/** Au-delà, les devis expirés sont seulement comptés, pas listés. */
export const MAX_EXPIRED_LISTED = 8;
/** Noms de clients plus longs : raccourcis dans l'e-mail. */
export const MAX_NAME_LENGTH = 40;

export const APP_URL = 'https://joy-finance-app.lovable.app';

/** Noms officiels trop longs pour un e-mail : forme courte lisible. */
const SHORT_NAMES: [RegExp, string][] = [
  [/de la Ville de Paris\s*$/i, 'Ville de Paris (Bureau du Design)'],
  [/^IMCI\b/i, 'IMCI'],
];

export interface DigestData {
  derniere_synchro: string | null;
  factures: Invoice[];
  relances: ClientReminder[];
  devis: Quote[];
}

export interface Digest {
  subject: string;
  body: string;
}

/** Une facture ou un devis cité dans « Depuis la dernière synchro ». */
export interface ChangeLine {
  number: string;
  client_name: string;
  amount: number;
  title?: string | null;
  /** Précision courte, par exemple « déjà payée ». */
  note?: string;
}

/** Ce que la synchronisation vient de changer dans l'app. */
export interface WeekChanges {
  /** Date (AAAA-MM-JJ) de la synchro précédente, null si inconnue. */
  since: string | null;
  paid: ChangeLine[];
  invoiced: ChangeLine[];
  creditNotes: ChangeLine[];
  cancelledInvoices: ChangeLine[];
  newQuotes: ChangeLine[];
  signedQuotes: ChangeLine[];
  refusedQuotes: ChangeLine[];
  /** Écarts que la synchro n'a pas corrigés (facture payée dans l'app, pas dans Indy…). */
  gaps: string[];
}

export interface WeeklyOptions {
  /** Changements de la synchro ; null = aperçu sans synchro (npm run bilan). */
  changes: WeekChanges | null;
  /** Ligne d'état technique en fin d'e-mail (« Synchro Indy OK… »). */
  syncLine: string | null;
}

const eur = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  .replace(/[\u202f\u00a0]/g, ' ');
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dateFr = (iso: string) => iso.split('-').reverse().join('/');
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function shortName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  for (const [re, short] of SHORT_NAMES) if (re.test(clean)) return short;
  if (clean.length <= MAX_NAME_LENGTH) return clean;
  const cut = clean.slice(0, MAX_NAME_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`;
}

const quoteLabel = (q: Pick<Quote, 'client_name' | 'title' | 'amount'>) =>
  `${shortName(q.client_name)}${q.title ? ` « ${q.title} »` : ''} ${eur(Number(q.amount))}`;

/** Les listes calculées une fois pour toutes les sections. */
function analyse(data: DigestData, today: string) {
  const invoices = data.factures.map(i => ({ ...i, amount: Number(i.amount) }));
  const clients = groupByClient(invoices, data.relances, today);
  const urgent = clients.filter(c => c.urgent);
  const others = clients.filter(c => !c.urgent && c.total > 0);
  const rec = computeReceivables(invoices, today);
  const nextWeek = addDays(today, 7);
  const dueSoon = invoices
    .filter(i => isUnpaid(i) && i.amount > 0)
    .filter(i => { const d = effectiveDueDate(i); return d >= today && d <= nextWeek; })
    .sort((a, b) => effectiveDueDate(a).localeCompare(effectiveDueDate(b)));

  const quotes = data.devis.map(q => ({ ...q, amount: Number(q.amount) }));
  const pq = computePendingQuotes(quotes, today);
  const followUp = pq.pending.quotes.filter(q => daysSinceIssued(q, today) >= QUOTE_FOLLOW_UP_DAYS);
  const waiting = pq.pending.quotes.filter(q => daysSinceIssued(q, today) < QUOTE_FOLLOW_UP_DAYS);
  return { urgent, others, rec, dueSoon, pq, followUp, waiting };
}
type Analysis = ReturnType<typeof analyse>;

function todoLines(a: Analysis, today: string): string[] {
  const lines: string[] = [];
  for (const c of a.urgent) {
    const n = c.count > 1 ? ` (${plural(c.count, 'facture', 'factures')})` : '';
    lines.push(`- Relancer ${shortName(c.name)} : ${eur(c.total)}${n}, ${c.maxDaysLate} j de retard, ${c.lastReminder ? `relancé le ${dayMonth(c.lastReminder)}` : 'jamais relancé'}`);
  }
  for (const q of a.pq.signed.quotes) {
    lines.push(`- Facturer le devis signé ${quoteLabel(q)} (devis du ${dayMonth(q.date_issued)})`);
  }
  for (const q of a.followUp) {
    lines.push(`- Relancer le devis ${quoteLabel(q)} : envoyé le ${dayMonth(q.date_issued)}, sans réponse depuis ${daysSinceIssued(q, today)} j`);
  }
  for (const q of a.pq.expired.quotes.slice(0, MAX_EXPIRED_LISTED)) {
    lines.push(`- Devis ${quoteLabel(q)} expiré le ${q.date_expires ? dayMonth(q.date_expires) : '?'} : relancer ou annuler dans Indy`);
  }
  const rest = a.pq.expired.count - MAX_EXPIRED_LISTED;
  if (rest > 0) lines.push(`- et ${plural(rest, 'devis expiré plus ancien', 'devis expirés plus anciens')}`);
  if (!lines.length) lines.push('Rien à relancer ni à facturer cette semaine.');
  return lines;
}

function changeLines(c: WeekChanges): string[] {
  const lines: string[] = [];
  const item = (l: ChangeLine) =>
    `    ${l.number} · ${shortName(l.client_name)}${l.title ? ` « ${l.title} »` : ''} · ${eur(l.amount)}${l.note ? ` (${l.note})` : ''}`;
  const block = (label: string, list: ChangeLine[]) => {
    if (!list.length) return;
    lines.push(`- ${label} (${list.length}) :`, ...list.map(item));
  };
  block('Factures payées', c.paid);
  block('Nouvelles factures', c.invoiced);
  block('Avoirs', c.creditNotes);
  block('Factures annulées', c.cancelledInvoices);
  block('Nouveaux devis', c.newQuotes);
  block('Devis signés', c.signedQuotes);
  block('Devis refusés ou annulés', c.refusedQuotes);
  for (const g of c.gaps) lines.push(`- À vérifier : ${g}`);
  if (!lines.length) lines.push('Rien de nouveau dans Indy.');
  return lines;
}

function positionLines(a: Analysis): string[] {
  const lines = [
    `${eur(a.rec.unpaidTotal)} à encaisser sur ${plural(a.rec.unpaidCount, 'facture', 'factures')}, dont ${eur(a.rec.lateTotal)} en retard.`,
  ];
  if (a.dueSoon.length) {
    lines.push(`Arrivent à échéance d'ici lundi prochain : ${a.dueSoon
      .map(i => `${shortName(i.client_name)} ${eur(i.amount)} le ${dayMonth(effectiveDueDate(i))}`).join(' ; ')}.`);
  }
  if (a.others.length) {
    lines.push('Les autres factures non payées :');
    for (const c of a.others) {
      const late = c.maxDaysLate > 0 ? `${c.maxDaysLate} j de retard` : 'pas encore échue';
      lines.push(`- ${shortName(c.name)} : ${eur(c.total)}, ${late}${c.lastReminder ? `, relancé le ${dayMonth(c.lastReminder)}` : ''}`);
    }
  }
  if (a.waiting.length) {
    lines.push(`Devis envoyés récemment, à laisser venir : ${plural(a.waiting.length, 'devis', 'devis')} (${eur(a.waiting.reduce((s, q) => s + q.amount, 0))}).`);
  }
  return lines;
}

/** Sections « À faire » et « Où tu en es », réutilisées par l'e-mail d'arrêt. */
export function todoAndPosition(data: DigestData, today: string): { todo: string[]; position: string[] } {
  const a = analyse(data, today);
  return { todo: todoLines(a, today), position: positionLines(a) };
}

export function buildWeekly(data: DigestData, today: string, opts: WeeklyOptions): Digest {
  const a = analyse(data, today);
  const c = opts.changes;
  const lines: string[] = [];

  lines.push('À FAIRE CETTE SEMAINE', ...todoLines(a, today));
  if (c) {
    lines.push('', `DEPUIS LA DERNIÈRE SYNCHRO${c.since ? ` (${dayMonth(c.since)})` : ''}`, ...changeLines(c));
  }
  lines.push('', 'OÙ TU EN ES', ...positionLines(a));
  lines.push('');
  if (opts.syncLine) lines.push(opts.syncLine);
  lines.push(`Noter une relance : ${APP_URL}/factures (bouton « Relancé aujourd'hui »).`);
  lines.push('Rien n\'a été envoyé à tes clients : c\'est ton aide-mémoire.');

  const parts: string[] = [];
  if (a.urgent.length) parts.push(plural(a.urgent.length, 'client à relancer', 'clients à relancer'));
  if (a.pq.signed.count) parts.push(plural(a.pq.signed.count, 'devis à facturer', 'devis à facturer'));
  const toDecide = a.followUp.length + a.pq.expired.count;
  if (toDecide) parts.push(plural(toDecide, 'devis à trancher', 'devis à trancher'));
  if (!parts.length) parts.push('rien à relancer');
  if (c?.paid.length) parts.push(plural(c.paid.length, 'facture payée', 'factures payées'));
  parts.push(`${eur(a.rec.unpaidTotal)} à encaisser`);
  return { subject: `Nowadays · ${parts.join(' · ')}`, body: lines.join('\n') };
}

/** Date du jour pour les e-mails, au format AAAA-MM-JJ (heure de Paris). */
export const todayParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
export { dateFr };
