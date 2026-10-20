import { makeTransactionPredicates, type Transaction, type Category } from './dashboard-utils';
import { estimateCotisations, type DeclarationSettings } from './declaration-utils';

/**
 * « À mettre de côté » : ce qui, dans tes encaissements, ne t'appartient pas.
 * - TVA collectée : à partir de la date d'assujettissement, chaque encaissement
 *   est TTC et contient TTC × taux / (100 + taux) de TVA (20/120 à 20 %).
 * - Cotisations URSSAF : calculées sur le CA HT (encaissements moins TVA),
 *   trimestre par trimestre, avec le même arrondi que la page Déclaration pour
 *   que les deux écrans affichent le même montant.
 * - « Vraiment à toi » = encaissements - provisions - dépenses hors rémunération
 *   et hors prélèvements URSSAF : ces prélèvements paient des cotisations déjà
 *   comptées dans les provisions (celles du trimestre précédent), les retirer
 *   aussi en dépenses les compterait deux fois.
 *
 * Les réglages passés doivent être ceux de l'année affichée (effectiveSettings).
 */

/** Prélèvement URSSAF (cotisations), reconnu à son libellé bancaire. */
export const isUrssafPayment = (t: Pick<Transaction, 'amount' | 'label'>) => t.amount < 0 && /urssaf/i.test(t.label);

/** Part de TVA contenue dans un encaissement (0 avant la date d'assujettissement). */
export function tvaPart(amount: number, date: string, settings: Pick<DeclarationSettings, 'tvaStartDate' | 'tvaRate'>): number {
  if (!settings.tvaStartDate || date < settings.tvaStartDate || settings.tvaRate <= 0) return 0;
  return amount * settings.tvaRate / (100 + settings.tvaRate);
}

export interface RevenueSplit {
  ttc: number;  // encaissements (CA tel qu'il arrive sur le compte)
  tva: number;  // TVA collectée contenue dedans
  ht: number;   // CA hors taxe, base des cotisations
}

export function splitRevenue(transactions: Transaction[], categories: Category[], settings: DeclarationSettings): RevenueSplit {
  const { isRevenue } = makeTransactionPredicates(categories);
  let ttc = 0;
  let tva = 0;
  for (const t of transactions) {
    if (!isRevenue(t)) continue;
    ttc += t.amount;
    tva += tvaPart(t.amount, t.date, settings);
  }
  return { ttc, tva, ht: ttc - tva };
}

export interface Provisions {
  encaissements: number;
  tva: number;
  social: number;
  cfp: number;
  liberatoire: number;
  cotisations: number;   // social + cfp + libératoire
  total: number;         // cotisations + TVA
  depenses: number;      // vraies dépenses, hors rémunération et hors prélèvements URSSAF
  urssafPaid: number;    // prélèvements URSSAF de la période, non comptés en dépenses
  aMoi: number;          // encaissements - total - dépenses
}

const quarterOf = (date: string) => Math.ceil(parseInt(date.slice(5, 7), 10) / 3);

/**
 * Provisions sur un ensemble de transactions (une période du tableau de bord ou
 * de la Déclaration). Les cotisations sont estimées trimestre par trimestre puis
 * additionnées : l'année vaut exactement la somme de ses 4 trimestres.
 */
export function computeProvisions(transactions: Transaction[], categories: Category[], settings: DeclarationSettings): Provisions {
  const { isRealExpense } = makeTransactionPredicates(categories);
  const byQuarter = new Map<number, Transaction[]>();
  for (const t of transactions) {
    const q = quarterOf(t.date);
    byQuarter.set(q, [...(byQuarter.get(q) ?? []), t]);
  }

  let encaissements = 0, tva = 0, social = 0, cfp = 0, liberatoire = 0;
  for (const txs of byQuarter.values()) {
    const split = splitRevenue(txs, categories, settings);
    const est = estimateCotisations(split.ht, settings);
    encaissements += split.ttc;
    tva += split.tva;
    social += est.social;
    cfp += est.cfp;
    liberatoire += est.liberatoire;
  }
  const cotisations = social + cfp + liberatoire;
  const total = cotisations + tva;
  const depenses = transactions.filter(t => isRealExpense(t) && !isUrssafPayment(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
  const urssafPaid = transactions.filter(isUrssafPayment).reduce((s, t) => s + Math.abs(t.amount), 0);
  return { encaissements, tva, social, cfp, liberatoire, cotisations, total, depenses, urssafPaid, aMoi: encaissements - total - depenses };
}

/** Échéance URSSAF d'un trimestre : dernier jour du mois qui suit le trimestre (AAAA-MM-JJ). */
export function urssafDueDate(year: number, quarter: number): string {
  const month = quarter * 3 + 1; // mois suivant le trimestre, 13 = janvier N+1
  const y = month > 12 ? year + 1 : year;
  const m = month > 12 ? 1 : month;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Trimestre dont on affiche l'échéance pour une année : le premier dont
 * l'échéance n'est pas encore passée à la date du jour ; T4 pour une année
 * entièrement échue.
 */
export function upcomingDeadlineQuarter(year: number, today: string): number {
  for (const q of [1, 2, 3, 4]) {
    if (urssafDueDate(year, q) >= today) return q;
  }
  return 4;
}

export interface UrssafDeadline {
  year: number;
  quarter: number;
  dueDate: string;
  amount: number;
  passed: boolean;
}

/** Échéance URSSAF d'un trimestre et montant estimé, à partir des transactions de l'année. */
export function urssafDeadline(
  allYearTransactions: Transaction[], categories: Category[], settings: DeclarationSettings,
  year: number, quarter: number, today: string,
): UrssafDeadline {
  const txs = allYearTransactions.filter(t => quarterOf(t.date) === quarter);
  const amount = computeProvisions(txs, categories, settings).cotisations;
  const dueDate = urssafDueDate(year, quarter);
  return { year, quarter, dueDate, amount, passed: dueDate < today };
}

/** Date du jour au format AAAA-MM-JJ, en heure locale. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
