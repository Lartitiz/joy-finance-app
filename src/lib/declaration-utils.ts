import type { Transaction, Category } from './dashboard-utils';

/**
 * Aide au calcul des déclarations URSSAF pour la micro-entreprise.
 *
 * ⚠️ Les taux et plafonds ci-dessous sont INDICATIFS (barème micro-entrepreneur
 * courant) et entièrement modifiables dans l'écran Déclaration. L'outil se
 * contente de multiplier ton CA par le taux que TU choisis — il ne remplace pas
 * ton taux officiel URSSAF. Vérifie toujours le montant final sur ton compte.
 */

export interface Regime {
  id: string;
  label: string;
  /** Cotisations sociales, en % du CA */
  socialRate: number;
  /** Versement libératoire de l'impôt (optionnel), en % du CA */
  liberatoireRate: number;
  /** Seuil annuel de chiffre d'affaires du régime micro */
  plafond: number;
}

export const REGIMES: Regime[] = [
  { id: 'bnc', label: 'Prestations libérales (BNC)', socialRate: 24.6, liberatoireRate: 2.2, plafond: 77700 },
  { id: 'bic_services', label: 'Prestations de services (BIC)', socialRate: 21.2, liberatoireRate: 1.7, plafond: 77700 },
  { id: 'vente', label: 'Vente de marchandises / hébergement', socialRate: 12.3, liberatoireRate: 1.0, plafond: 188700 },
];

export interface DeclarationSettings {
  regimeId: string;
  socialRate: number;
  liberatoireEnabled: boolean;
  liberatoireRate: number;
  plafond: number;
}

export function defaultSettings(): DeclarationSettings {
  const r = REGIMES[0];
  return {
    regimeId: r.id,
    socialRate: r.socialRate,
    liberatoireEnabled: false,
    liberatoireRate: r.liberatoireRate,
    plafond: r.plafond,
  };
}

const STORAGE_PREFIX = 'joy-declaration-settings:';

export function loadSettings(userId: string): DeclarationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...parsed };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(userId: string, settings: DeclarationSettings): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(settings));
  } catch {
    /* localStorage indisponible : on ignore silencieusement */
  }
}

/** Arrondi à l'euro le plus proche (l'URSSAF ne veut pas de centimes). */
export function roundEuro(n: number): number {
  return Math.round(n);
}

const isRevenue = (t: Transaction, revCatIds: Set<string>) =>
  t.amount > 0 && !!t.category_id && revCatIds.has(t.category_id);

/** Somme brute (non arrondie) du CA "revenu" d'un trimestre donné. */
export function quarterRevenueRaw(
  allYearTransactions: Transaction[],
  categories: Category[],
  quarter: number,
): number {
  const revCatIds = new Set(categories.filter(c => c.type === 'revenue').map(c => c.id));
  const startMonth = (quarter - 1) * 3 + 1;
  const months = [startMonth, startMonth + 1, startMonth + 2];
  return allYearTransactions
    .filter(t => {
      if (!isRevenue(t, revCatIds)) return false;
      const m = parseInt(t.date.slice(5, 7), 10);
      return months.includes(m);
    })
    .reduce((s, t) => s + t.amount, 0);
}

/** Rentrées positives non classées sur un trimestre (donc absentes du CA). */
export function quarterUncategorized(
  allYearTransactions: Transaction[],
  quarter: number,
): { count: number; total: number } {
  const startMonth = (quarter - 1) * 3 + 1;
  const months = [startMonth, startMonth + 1, startMonth + 2];
  const positives = allYearTransactions.filter(t => {
    if (t.amount <= 0 || t.category_id) return false;
    const m = parseInt(t.date.slice(5, 7), 10);
    return months.includes(m);
  });
  return { count: positives.length, total: positives.reduce((s, t) => s + t.amount, 0) };
}

/** CA "revenu" cumulé sur l'année entière (brut, non arrondi). */
export function yearRevenueRaw(
  allYearTransactions: Transaction[],
  categories: Category[],
): number {
  const revCatIds = new Set(categories.filter(c => c.type === 'revenue').map(c => c.id));
  return allYearTransactions.filter(t => isRevenue(t, revCatIds)).reduce((s, t) => s + t.amount, 0);
}

export interface CotisationEstimate {
  caDeclared: number;   // CA arrondi à déclarer
  social: number;       // cotisations sociales estimées (arrondies)
  liberatoire: number;  // versement libératoire estimé (arrondi, 0 si désactivé)
  total: number;        // total à mettre de côté (arrondi)
}

/**
 * Estimation à partir du CA d'un trimestre. Le CA est d'abord arrondi à l'euro,
 * puis chaque part est calculée sur ce CA arrondi.
 */
export function estimateCotisations(
  quarterRevenueRawValue: number,
  settings: DeclarationSettings,
): CotisationEstimate {
  const caDeclared = roundEuro(quarterRevenueRawValue);
  const social = roundEuro(caDeclared * (settings.socialRate / 100));
  const liberatoire = settings.liberatoireEnabled
    ? roundEuro(caDeclared * (settings.liberatoireRate / 100))
    : 0;
  return { caDeclared, social, liberatoire, total: social + liberatoire };
}

export interface ThresholdStatus {
  yearRevenue: number;   // CA annuel arrondi
  plafond: number;
  pct: number;           // 0-100+ (peut dépasser)
  remaining: number;     // ce qu'il reste avant le plafond (peut être négatif)
  warn: boolean;         // à surveiller (>= 80%)
  over: boolean;         // plafond dépassé
}

export function thresholdStatus(yearRevenueRawValue: number, plafond: number): ThresholdStatus {
  const yearRevenue = roundEuro(yearRevenueRawValue);
  const pct = plafond > 0 ? (yearRevenue / plafond) * 100 : 0;
  return {
    yearRevenue,
    plafond,
    pct,
    remaining: plafond - yearRevenue,
    warn: pct >= 80,
    over: yearRevenue > plafond,
  };
}
