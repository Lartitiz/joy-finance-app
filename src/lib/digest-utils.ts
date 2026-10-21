/**
 * Bilan mensuel envoyé par e-mail à Laetitia (tools/indy-sync, npm run bilan) :
 * factures à relancer et devis à trancher. Aide-mémoire : rien n'est envoyé aux
 * clients. Mêmes règles que la page Factures et le bloc « Devis en attente ».
 */
import type { Invoice } from './invoice-utils';
import { computeReceivables } from './invoice-utils';
import { groupByClient, type ClientReminder } from './reminder-utils';
import { computePendingQuotes, daysSinceIssued, type Quote } from './quote-utils';

/** Un devis en attente envoyé depuis 15 jours sans réponse est à relancer. */
export const QUOTE_FOLLOW_UP_DAYS = 15;
/** Au-delà, les devis expirés sont seulement comptés, pas listés. */
export const MAX_EXPIRED_LISTED = 8;

export const APP_URL = 'https://joy-finance-app.lovable.app';

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

const eur = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  .replace(/[  ]/g, ' ');
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dateFr = (iso: string) => iso.split('-').reverse().join('/');
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const quoteLine = (q: Quote) => `${q.client_name}${q.title ? ` (${q.title})` : ''} : ${eur(Number(q.amount))}`;

export function buildDigest(data: DigestData, today: string): Digest {
  const invoices = data.factures.map(i => ({ ...i, amount: Number(i.amount) }));
  const clients = groupByClient(invoices, data.relances, today);
  const urgent = clients.filter(c => c.urgent);
  const others = clients.filter(c => !c.urgent && c.total > 0);
  const rec = computeReceivables(invoices, today);

  const quotes = data.devis.map(q => ({ ...q, amount: Number(q.amount) }));
  const pq = computePendingQuotes(quotes, today);
  const followUp = pq.pending.quotes.filter(q => daysSinceIssued(q, today) >= QUOTE_FOLLOW_UP_DAYS);
  const waiting = pq.pending.quotes.filter(q => daysSinceIssued(q, today) < QUOTE_FOLLOW_UP_DAYS);

  const lines: string[] = [];
  const sync = data.derniere_synchro?.slice(0, 10) ?? null;
  lines.push(`Bilan du ${dateFr(today)}. ${sync ? `Factures et devis recopiés d'Indy le ${dateFr(sync)}.` : 'Aucune recopie Indy enregistrée.'}`);
  if (sync && daysSinceIssued({ date_issued: sync }, today) > 8) {
    lines.push(`Attention : la dernière recopie Indy date de plus de 8 jours, les chiffres peuvent avoir changé.`);
  }
  lines.push('Rien n\'a été envoyé à tes clients : c\'est ton aide-mémoire.');

  lines.push('', `FACTURES : ${eur(rec.unpaidTotal)} à encaisser (${plural(rec.unpaidCount, 'facture', 'factures')}), dont ${eur(rec.lateTotal)} en retard.`);
  if (urgent.length) {
    lines.push('', 'À relancer en priorité (plus de 30 jours de retard, pas relancé depuis 15 jours) :');
    for (const c of urgent) {
      lines.push(`- ${c.name} : ${eur(c.total)}, ${plural(c.count, 'facture', 'factures')}, ${c.maxDaysLate} j de retard, ${c.lastReminder ? `relancé le ${dayMonth(c.lastReminder)}` : 'jamais relancé'}`);
    }
  } else {
    lines.push('', 'Aucune facture à relancer en priorité.');
  }
  if (others.length) {
    lines.push('', 'Les autres factures non payées :');
    for (const c of others) {
      const late = c.maxDaysLate > 0 ? `${c.maxDaysLate} j de retard` : 'pas encore échue';
      lines.push(`- ${c.name} : ${eur(c.total)}, ${late}${c.lastReminder ? `, relancé le ${dayMonth(c.lastReminder)}` : ''}`);
    }
  }

  lines.push('', 'DEVIS');
  if (followUp.length) {
    lines.push('', `À relancer (envoyés depuis ${QUOTE_FOLLOW_UP_DAYS} jours ou plus, sans réponse) :`);
    for (const q of followUp) {
      lines.push(`- ${quoteLine(q)}, envoyé le ${dayMonth(q.date_issued)}${q.date_expires ? `, valable jusqu'au ${dayMonth(q.date_expires)}` : ''}`);
    }
  }
  if (pq.signed.count) {
    lines.push('', 'Signés, à facturer :');
    for (const q of pq.signed.quotes) lines.push(`- ${quoteLine(q)}, signé (devis du ${dayMonth(q.date_issued)})`);
  }
  if (pq.expired.count) {
    lines.push('', 'Expirés sans réponse : les relancer, ou les annuler dans Indy :');
    for (const q of pq.expired.quotes.slice(0, MAX_EXPIRED_LISTED)) {
      lines.push(`- ${quoteLine(q)}, expiré le ${q.date_expires ? dateFr(q.date_expires) : '?'}`);
    }
    const rest = pq.expired.count - MAX_EXPIRED_LISTED;
    if (rest > 0) lines.push(`- et ${plural(rest, 'devis plus ancien', 'devis plus anciens')}`);
  }
  if (waiting.length) {
    lines.push('', `Envoyés récemment, à laisser venir : ${plural(waiting.length, 'devis', 'devis')} (${eur(waiting.reduce((s, q) => s + q.amount, 0))}).`);
  }
  if (!followUp.length && !pq.signed.count && !pq.expired.count && !waiting.length) {
    lines.push('', 'Aucun devis en attente.');
  }

  lines.push('', `Pour noter une relance : ${APP_URL}/factures (bouton « Relancé aujourd'hui »).`);

  const parts: string[] = [];
  if (urgent.length) parts.push(plural(urgent.length, 'client à relancer', 'clients à relancer'));
  const toDecide = followUp.length + pq.expired.count;
  if (toDecide) parts.push(plural(toDecide, 'devis à trancher', 'devis à trancher'));
  if (pq.signed.count) parts.push(plural(pq.signed.count, 'devis à facturer', 'devis à facturer'));
  const subject = `Nowadays : ${parts.length ? parts.join(', ') : 'rien à relancer ce mois-ci'}`;

  return { subject, body: lines.join('\n') };
}
