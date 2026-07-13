// Règles de catégorisation apprises à partir des corrections manuelles.
// Tout est déterministe (pas d'IA) : on extrait un mot-clé du libellé bancaire,
// puis on retrouve les transactions dont le libellé contient ce mot-clé.

export interface CategorizationRule {
  id: string;
  keyword: string;
  category_id: string;
  match_count: number;
}

// Mots « bruit » d'un relevé bancaire : présents partout, jamais discriminants.
const NOISE_WORDS = new Set([
  'VIR', 'VIRT', 'VIREMENT', 'VIREMENTS', 'PRLV', 'PRELV', 'PRELEVEMENT',
  'PRELEVEMENTS', 'SEPA', 'CB', 'CARTE', 'PAIEMENT', 'PAIMENT', 'PAIMNT',
  'ACHAT', 'ACHATS', 'RETRAIT', 'DEPOT', 'CHEQUE', 'CHQ', 'FACTURE', 'FAC',
  'FACT', 'REF', 'REFERENCE', 'MANDAT', 'ECH', 'ECHEANCE', 'COTISATION',
  'PAYMENT', 'PAYMENTS', 'MOTIF', 'TIP', 'VPC', 'EMIS', 'RECU', 'DATE',
  'NUM', 'NUMERO', 'DU', 'DE', 'DES', 'LA', 'LE', 'LES', 'ET', 'EUR', 'EU',
  'EUROPE', 'FR', 'FRANCE', 'SAS', 'SARL', 'EURL', 'INC', 'LTD', 'SA',
  'WWW', 'COM', 'ORDR', 'ORDRE', 'POUR', 'PAR',
]);

// Normalise un texte : majuscules, sans accents, espaces compactés.
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Découpe un libellé en jetons « significatifs » (hors bruit, chiffres, dates).
function significantTokens(label: string): string[] {
  return normalizeLabel(label)
    .split(' ')
    .filter((tok) => {
      if (tok.length < 3) return false;
      if (NOISE_WORDS.has(tok)) return false;
      if (/^\d+$/.test(tok)) return false; // nombres purs
      if (/^\d/.test(tok)) return false; // commence par un chiffre (dates, refs)
      return true;
    });
}

// Extrait le mot-clé le plus probable d'un libellé (le nom du marchand en général).
// Heuristique : le jeton significatif le plus long. Chaîne vide si rien de sûr.
export function extractKeyword(label: string): string {
  const tokens = significantTokens(label);
  if (tokens.length === 0) return '';
  return tokens.reduce((best, tok) => (tok.length > best.length ? tok : best), '');
}

// Retrouve la règle qui s'applique à un libellé : celle dont le mot-clé y est contenu.
// En cas de plusieurs correspondances, on privilégie le mot-clé le plus long
// (le plus spécifique), puis le plus utilisé.
export function matchRule(
  label: string,
  rules: CategorizationRule[]
): CategorizationRule | null {
  const normalized = normalizeLabel(label);
  const candidates = rules.filter((r) => r.keyword && normalized.includes(r.keyword));
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => b.keyword.length - a.keyword.length || b.match_count - a.match_count
  );
  return candidates[0];
}
