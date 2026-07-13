import { describe, it, expect } from 'vitest';
import { normalizeLabel, extractKeyword, matchRule, type CategorizationRule } from './rule-utils';

describe('normalizeLabel', () => {
  it('met en majuscules sans accents', () => {
    expect(normalizeLabel('Prélèvement Ürssaf')).toBe('PRELEVEMENT URSSAF');
  });
  it('compacte ponctuation et espaces', () => {
    expect(normalizeLabel('VIR-SEPA   STRIPE.PAYMENTS')).toBe('VIR SEPA STRIPE PAYMENTS');
  });
});

describe('extractKeyword', () => {
  it('trouve le marchand dans un virement Stripe', () => {
    expect(extractKeyword('VIR SEPA STRIPE PAYMENTS EU')).toBe('STRIPE');
  });
  it('ignore le bruit bancaire et les nombres', () => {
    expect(extractKeyword('PRLV SEPA URSSAF 123456')).toBe('URSSAF');
  });
  it('prend le jeton le plus long', () => {
    expect(extractKeyword('CB BOULANGERIE MARTIN')).toBe('BOULANGERIE');
  });
  it('renvoie vide si rien de significatif', () => {
    expect(extractKeyword('VIR SEPA 12/07 4521')).toBe('');
  });
});

describe('matchRule', () => {
  const rules: CategorizationRule[] = [
    { id: '1', keyword: 'STRIPE', category_id: 'com', match_count: 14 },
    { id: '2', keyword: 'URSSAF', category_id: 'charges', match_count: 6 },
  ];
  it('reconnaît un libellé même différent de la 1re correction', () => {
    expect(matchRule('STRIPE PAYMENTS EUROPE', rules)?.category_id).toBe('com');
  });
  it('renvoie null si aucun mot-clé ne matche', () => {
    expect(matchRule('CB CARREFOUR CITY', rules)).toBeNull();
  });
  it('privilégie le mot-clé le plus spécifique', () => {
    const r: CategorizationRule[] = [
      { id: '1', keyword: 'AMAZON', category_id: 'a', match_count: 2 },
      { id: '2', keyword: 'AMAZON WEB SERVICES', category_id: 'b', match_count: 1 },
    ];
    expect(matchRule('PRLV AMAZON WEB SERVICES EMEA', r)?.category_id).toBe('b');
  });
});
