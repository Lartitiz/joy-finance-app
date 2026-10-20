import { makeTransactionPredicates, type Transaction, type Category } from './dashboard-utils';

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
  /** Contribution à la formation professionnelle (CFP), en % du CA */
  cfpRate: number;
  /** Versement libératoire de l'impôt (optionnel), en % du CA */
  liberatoireRate: number;
  /** Seuil annuel de chiffre d'affaires du régime micro */
  plafond: number;
}

/**
 * Barème officiel par année (source : service-public.gouv.fr, fiches F36232
 * « cotisations sociales du micro-entrepreneur » et F32353 « seuils du régime
 * micro », vérifiées en 2026). À compléter chaque 1er janvier : une année
 * absente reprend la dernière année connue qui la précède.
 * CFP (fiche F23459) : 0,2 % en libéral, 0,1 % en commerce (0,3 % pour un
 * artisan, à saisir à la main).
 */
type Bareme = Pick<Regime, 'socialRate' | 'cfpRate' | 'liberatoireRate' | 'plafond'>;

export const BAREMES: Record<string, Record<number, Bareme>> = {
  bnc: {
    2025: { socialRate: 24.6, cfpRate: 0.2, liberatoireRate: 2.2, plafond: 77700 },
    2026: { socialRate: 25.6, cfpRate: 0.2, liberatoireRate: 2.2, plafond: 83600 },
  },
  bic_services: {
    2025: { socialRate: 21.2, cfpRate: 0.1, liberatoireRate: 1.7, plafond: 77700 },
    2026: { socialRate: 21.2, cfpRate: 0.1, liberatoireRate: 1.7, plafond: 83600 },
  },
  vente: {
    2025: { socialRate: 12.3, cfpRate: 0.1, liberatoireRate: 1.0, plafond: 188700 },
    2026: { socialRate: 12.3, cfpRate: 0.1, liberatoireRate: 1.0, plafond: 203100 },
  },
};

const REGIME_LABELS: { id: string; label: string }[] = [
  { id: 'bnc', label: 'Prestations libérales (BNC)' },
  { id: 'bic_services', label: 'Prestations de services (BIC)' },
  { id: 'vente', label: 'Vente de marchandises / hébergement' },
];

/** Barème officiel d'un régime pour une année donnée. */
export function officialRates(regimeId: string, year: number): Bareme {
  const table = BAREMES[regimeId] ?? BAREMES.bnc;
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const known = years.filter(y => y <= year);
  return table[known.length > 0 ? known[known.length - 1] : years[0]];
}

/**
 * Dernière année dont le barème officiel est enregistré pour ce régime, si
 * l'année demandée n'y est pas encore (null sinon). Sert au rappel de mise à
 * jour affiché sur la page Déclaration.
 */
export function missingBaremeFallbackYear(regimeId: string, year: number): number | null {
  const table = BAREMES[regimeId] ?? BAREMES.bnc;
  const years = Object.keys(table).map(Number);
  const last = Math.max(...years);
  return year > last ? last : null;
}

/** Régimes avec le barème de l'année en cours (pour les valeurs par défaut). */
export const REGIMES: Regime[] = REGIME_LABELS.map(r => ({
  ...r,
  ...officialRates(r.id, new Date().getFullYear()),
}));

/**
 * Seuils de franchise en base de TVA pour les prestations de services (BNC/BIC) :
 * en-dessous de la limite de base tu n'es pas redevable de la TVA ; entre les deux
 * limites tu peux encore en être dispensée jusqu'à la fin de l'année en cours ;
 * au-dessus de la limite majorée, la TVA s'applique dès le 1er jour du dépassement.
 * Indicatif : vérifie toujours ta situation exacte sur impots.gouv.fr.
 */
export const TVA_LIMITE_BASE = 37500;
export const TVA_LIMITE_MAJOREE = 41250;
export const TVA_TAUX_NORMAL = 20;

export interface DeclarationSettings {
  regimeId: string;
  /**
   * true : taux et plafond suivent le barème officiel de l'année affichée.
   * false : on garde les valeurs saisies à la main ci-dessous.
   */
  useOfficialRates: boolean;
  socialRate: number;
  cfpRate: number;
  liberatoireEnabled: boolean;
  liberatoireRate: number;
  plafond: number;
  /** Date (AAAA-MM-JJ) à partir de laquelle tu factures la TVA ; vide = franchise. */
  tvaStartDate: string;
  /** Taux de TVA appliqué à partir de tvaStartDate, en %. */
  tvaRate: number;
}

export function defaultSettings(): DeclarationSettings {
  const r = REGIMES[0];
  return {
    regimeId: r.id,
    useOfficialRates: true,
    socialRate: r.socialRate,
    cfpRate: r.cfpRate,
    liberatoireEnabled: false,
    liberatoireRate: r.liberatoireRate,
    plafond: r.plafond,
    tvaStartDate: '',
    tvaRate: TVA_TAUX_NORMAL,
  };
}

/** Réglages réellement appliqués pour une année : barème officiel ou saisie manuelle. */
export function effectiveSettings(settings: DeclarationSettings, year: number): DeclarationSettings {
  if (!settings.useOfficialRates) return settings;
  return { ...settings, ...officialRates(settings.regimeId, year) };
}

/** Vrai si les taux enregistrés sont exactement un barème officiel (jamais retouchés). */
function matchesSomeOfficialBareme(s: Partial<DeclarationSettings>): boolean {
  const table = BAREMES[s.regimeId ?? 'bnc'];
  if (!table) return false;
  return Object.values(table).some(b =>
    b.socialRate === s.socialRate && b.plafond === s.plafond
    && (s.liberatoireRate === undefined || b.liberatoireRate === s.liberatoireRate));
}

const STORAGE_PREFIX = 'joy-declaration-settings:';

export function loadSettings(userId: string): DeclarationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<DeclarationSettings>;
    // Réglages enregistrés avant le barème par année : s'ils reprennent tels
    // quels un barème officiel (ex. 24,6 % / 77 700 €), ils suivent désormais
    // l'année affichée ; s'ils ont été retouchés, on les garde.
    const useOfficialRates = parsed.useOfficialRates ?? matchesSomeOfficialBareme(parsed);
    return { ...defaultSettings(), ...parsed, useOfficialRates };
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

/** Somme brute (non arrondie) du CA "revenu" d'un trimestre donné. */
export function quarterRevenueRaw(
  allYearTransactions: Transaction[],
  categories: Category[],
  quarter: number,
): number {
  // Même règle que le tableau de bord (catégorie revenu ET validée) : la
  // Déclaration et le tableau de bord affichent toujours le même CA.
  const { isRevenue } = makeTransactionPredicates(categories);
  const startMonth = (quarter - 1) * 3 + 1;
  const months = [startMonth, startMonth + 1, startMonth + 2];
  return allYearTransactions
    .filter(t => {
      if (!isRevenue(t)) return false;
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
  const { isRevenue } = makeTransactionPredicates(categories);
  return allYearTransactions.filter(isRevenue).reduce((s, t) => s + t.amount, 0);
}

export interface CotisationEstimate {
  caDeclared: number;   // CA arrondi à déclarer
  social: number;       // cotisations sociales estimées (arrondies)
  cfp: number;          // contribution à la formation professionnelle (arrondie)
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
  const cfp = roundEuro(caDeclared * ((settings.cfpRate ?? 0) / 100));
  const liberatoire = settings.liberatoireEnabled
    ? roundEuro(caDeclared * (settings.liberatoireRate / 100))
    : 0;
  return { caDeclared, social, cfp, liberatoire, total: social + cfp + liberatoire };
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
