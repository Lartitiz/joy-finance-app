import { describe, it, expect } from 'vitest';
import { computeOfferRevenueByQuarter, type Offer, type QuarterlyObjective } from './objectives-utils';

const recurringOffer: Offer = {
  id: 'offer-1',
  name: "L'Assistant",
  emoji: null,
  unit_price: 15,
  billing_type: 'recurring_monthly',
  recurring_duration: null, // illimité
  is_active: true,
  sort_order: 1,
};

const sixMonthOffer: Offer = {
  ...recurringOffer,
  id: 'offer-2',
  unit_price: 350,
  recurring_duration: 6,
};

describe('computeOfferRevenueByQuarter — report inter-années', () => {
  it("une cliente signée en T4 d'une offre récurrente illimitée compte encore l'année suivante", () => {
    const objectives: QuarterlyObjective[] = [
      { offer_id: 'offer-1', year: 2026, quarter: 4, target_new_clients: 1 },
    ];
    const ca2026 = computeOfferRevenueByQuarter(recurringOffer, objectives, 2026);
    const ca2027 = computeOfferRevenueByQuarter(recurringOffer, objectives, 2027);

    // 2026 : payante uniquement en T4 (oct-déc)
    expect(ca2026).toEqual([0, 0, 0, 15 * 3]);
    // 2027 : toujours active toute l'année (durée illimitée) — avant le fix : [0,0,0,0]
    expect(ca2027).toEqual([15 * 3, 15 * 3, 15 * 3, 15 * 3]);
  });

  it("une durée limitée (6 mois) signée en T4 s'arrête au bon mois l'année suivante", () => {
    const objectives: QuarterlyObjective[] = [
      { offer_id: 'offer-2', year: 2026, quarter: 4, target_new_clients: 1 }, // paie oct..mars
    ];
    const ca2027 = computeOfferRevenueByQuarter(sixMonthOffer, objectives, 2027);
    // Active jan/fév/mars 2027 (mois 4,5,6 de son cycle), plus rien ensuite
    expect(ca2027).toEqual([350 * 3, 0, 0, 0]);
  });

  it("un signup de l'année courante n'est pas affecté par l'absence de report", () => {
    const objectives: QuarterlyObjective[] = [
      { offer_id: 'offer-1', year: 2026, quarter: 1, target_new_clients: 2 },
    ];
    const ca2026 = computeOfferRevenueByQuarter(recurringOffer, objectives, 2026);
    expect(ca2026).toEqual([15 * 2 * 3, 15 * 2 * 3, 15 * 2 * 3, 15 * 2 * 3]);
  });
});
