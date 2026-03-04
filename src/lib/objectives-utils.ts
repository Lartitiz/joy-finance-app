/**
 * Quarterly revenue calculation utilities.
 *
 * Handles both one_time and recurring_monthly offers,
 * including carry-over of recurring clients across quarters.
 */

export interface Offer {
  id: string;
  name: string;
  emoji: string | null;
  unit_price: number;
  billing_type: 'recurring_monthly' | 'one_time';
  recurring_duration: number | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface QuarterlyObjective {
  id?: string;
  offer_id: string;
  year: number;
  quarter: number;
  target_new_clients: number;
}

/** Quarter start months (1-indexed) */
const Q_START = [1, 4, 7, 10] as const;
const Q_LABELS = ['Jan — Mar', 'Avr — Jun', 'Jul — Sep', 'Oct — Déc'] as const;

export function quarterLabel(q: number): string {
  return Q_LABELS[q - 1] ?? '';
}

export function quarterStartMonth(q: number): number {
  return Q_START[q - 1];
}

export function quarterMonths(q: number): [number, number, number] {
  const s = quarterStartMonth(q);
  return [s, s + 1, s + 2];
}

export function currentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

/**
 * For a given offer + all quarterly objectives for that offer in a year,
 * compute the projected revenue per quarter (T1-T4).
 *
 * Returns an array of 4 numbers [caT1, caT2, caT3, caT4].
 */
export function computeOfferRevenueByQuarter(
  offer: Offer,
  objectives: QuarterlyObjective[], // all quarterly objectives for this offer in the year
): [number, number, number, number] {
  const result: [number, number, number, number] = [0, 0, 0, 0];

  // Build a map: quarter -> target_new_clients
  const clientsByQ = new Map<number, number>();
  for (const obj of objectives) {
    clientsByQ.set(obj.quarter, obj.target_new_clients);
  }

  if (offer.billing_type === 'one_time') {
    // Simple: CA = new_clients × unit_price, all earned in the quarter of signing
    for (let q = 1; q <= 4; q++) {
      const clients = clientsByQ.get(q) ?? 0;
      result[q - 1] = clients * offer.unit_price;
    }
    return result;
  }

  // recurring_monthly: clients signed at quarter Q start paying from Q's first month
  // for recurring_duration months (or indefinitely if null)
  // We compute month by month (1-12) how many clients are active, then sum per quarter.

  // For each month (1-12), count active clients
  const monthlyActiveClients = new Array(12).fill(0);

  for (let q = 1; q <= 4; q++) {
    const newClients = clientsByQ.get(q) ?? 0;
    if (newClients === 0) continue;

    const startMonth = quarterStartMonth(q); // 1-indexed month they start paying
    const duration = offer.recurring_duration;
    const endMonth = duration ? startMonth + duration - 1 : 12; // cap at 12 for this year

    for (let m = startMonth; m <= Math.min(endMonth, 12); m++) {
      monthlyActiveClients[m - 1] += newClients;
    }
  }

  // Now sum per quarter
  for (let q = 1; q <= 4; q++) {
    const [m1, m2, m3] = quarterMonths(q);
    const ca =
      (monthlyActiveClients[m1 - 1] ?? 0) * offer.unit_price +
      (monthlyActiveClients[m2 - 1] ?? 0) * offer.unit_price +
      (monthlyActiveClients[m3 - 1] ?? 0) * offer.unit_price;
    result[q - 1] = ca;
  }

  return result;
}

export interface QuarterSummary {
  quarter: number;
  offerRows: {
    offer: Offer;
    targetNewClients: number;
    projectedRevenue: number;
  }[];
  totalProjected: number;
}

/**
 * Compute the full quarterly breakdown for all offers.
 */
export function computeAllQuarters(
  offers: Offer[],
  objectives: QuarterlyObjective[],
): QuarterSummary[] {
  const activeOffers = offers.filter((o) => o.is_active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Pre-compute revenue by offer
  const revenueByOffer = new Map<string, [number, number, number, number]>();
  for (const offer of activeOffers) {
    const offerObjectives = objectives.filter((o) => o.offer_id === offer.id);
    revenueByOffer.set(offer.id, computeOfferRevenueByQuarter(offer, offerObjectives));
  }

  // Build objective lookup: offerId-quarter -> target
  const objLookup = new Map<string, number>();
  for (const obj of objectives) {
    objLookup.set(`${obj.offer_id}-${obj.quarter}`, obj.target_new_clients);
  }

  const quarters: QuarterSummary[] = [];

  for (let q = 1; q <= 4; q++) {
    const offerRows = activeOffers.map((offer) => {
      const rev = revenueByOffer.get(offer.id)?.[q - 1] ?? 0;
      const target = objLookup.get(`${offer.id}-${q}`) ?? 0;
      return {
        offer,
        targetNewClients: target,
        projectedRevenue: rev,
      };
    });

    quarters.push({
      quarter: q,
      offerRows,
      totalProjected: offerRows.reduce((s, r) => s + r.projectedRevenue, 0),
    });
  }

  return quarters;
}
