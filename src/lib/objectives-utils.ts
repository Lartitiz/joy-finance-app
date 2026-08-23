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
 * For a given offer + ALL quarterly objectives for that offer (any year),
 * compute the projected revenue per quarter (T1-T4) of `targetYear`.
 *
 * Recurring clients signed in a *previous* year (e.g. Q4 last year, 12 months
 * duration) are carried over into `targetYear` if their paying window still
 * overlaps it — the projection no longer resets to zero every January 1st.
 * A `recurring_duration` of null means "indéfini" : the client is assumed to
 * still be paying for as long as `targetYear` runs.
 *
 * Returns an array of 4 numbers [caT1, caT2, caT3, caT4].
 */
export function computeOfferRevenueByQuarter(
  offer: Offer,
  objectives: QuarterlyObjective[], // all quarterly objectives for this offer, ANY year
  targetYear: number,
): [number, number, number, number] {
  const result: [number, number, number, number] = [0, 0, 0, 0];

  if (offer.billing_type === 'one_time') {
    // Simple: CA = new_clients × unit_price, earned in the quarter of signing (targetYear only)
    for (const obj of objectives) {
      if (obj.year !== targetYear || obj.target_new_clients === 0) continue;
      result[obj.quarter - 1] += obj.target_new_clients * offer.unit_price;
    }
    return result;
  }

  // recurring_monthly: each signup cohort (year, quarter, clients) pays from the
  // quarter's first month for `recurring_duration` months (or indefinitely if null).
  // We work in absolute month indices (year*12 + monthIndex0) so a cohort signed
  // in a prior year can still land inside targetYear's window.
  const targetStart = targetYear * 12;      // Jan of targetYear, 0-indexed
  const targetEnd = targetYear * 12 + 11;   // Dec of targetYear
  const monthlyActiveClients = new Array(12).fill(0); // index 0 = Jan of targetYear

  for (const obj of objectives) {
    if (obj.target_new_clients === 0) continue;
    const cohortStart = obj.year * 12 + (quarterStartMonth(obj.quarter) - 1);
    const duration = offer.recurring_duration;
    // Indefinite recurring: still active through the end of targetYear (no churn model).
    const cohortEnd = duration ? cohortStart + duration - 1 : targetEnd;
    if (cohortEnd < targetStart || cohortStart > targetEnd) continue; // no overlap with targetYear

    const from = Math.max(cohortStart, targetStart);
    const to = Math.min(cohortEnd, targetEnd);
    for (let m = from; m <= to; m++) {
      monthlyActiveClients[m - targetStart] += obj.target_new_clients;
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
 * Compute the full quarterly breakdown for all offers, for `targetYear`.
 *
 * `objectives` should contain ALL years' quarterly objectives (not just
 * targetYear) so that recurring clients signed in a previous year are
 * correctly carried over — see computeOfferRevenueByQuarter.
 */
export function computeAllQuarters(
  offers: Offer[],
  objectives: QuarterlyObjective[],
  targetYear: number,
): QuarterSummary[] {
  const activeOffers = offers.filter((o) => o.is_active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Pre-compute revenue by offer
  const revenueByOffer = new Map<string, [number, number, number, number]>();
  for (const offer of activeOffers) {
    const offerObjectives = objectives.filter((o) => o.offer_id === offer.id);
    revenueByOffer.set(offer.id, computeOfferRevenueByQuarter(offer, offerObjectives, targetYear));
  }

  // Build objective lookup (targetYear only): offerId-quarter -> target new clients,
  // used to display/edit the "new clients this quarter" input value.
  const objLookup = new Map<string, number>();
  for (const obj of objectives) {
    if (obj.year !== targetYear) continue;
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
