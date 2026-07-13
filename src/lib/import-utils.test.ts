import { describe, it, expect } from 'vitest';
import { dedupKey, splitDuplicates, parseAmount, parseDate, type ParsedTransaction } from './import-utils';

describe('dedupKey', () => {
  it('normalise casse et espaces multiples du libellé', () => {
    expect(dedupKey({ date: '2026-01-05', label: '  VIR  Client   SARL ', amount: 100 }))
      .toBe(dedupKey({ date: '2026-01-05', label: 'vir client sarl', amount: 100 }));
  });

  it('reconnaît un montant identique même si la base le renvoie en chaîne', () => {
    expect(dedupKey({ date: '2026-01-05', label: 'x', amount: 50 }))
      .toBe(dedupKey({ date: '2026-01-05', label: 'x', amount: '50.00' }));
  });
});

describe('splitDuplicates', () => {
  const t = (p: Partial<ParsedTransaction>): ParsedTransaction => ({ date: '2026-01-05', label: 'x', amount: 10, ...p });

  it('marque comme doublon ce qui existe déjà', () => {
    const { fresh, dupes } = splitDuplicates(
      [t({ amount: 10 }), t({ amount: 20 })],
      [{ date: '2026-01-05', label: 'x', amount: 10 }],
    );
    expect(dupes.map(d => d.amount)).toEqual([10]);
    expect(fresh.map(f => f.amount)).toEqual([20]);
  });

  it('garde la 2e occurrence légitime quand la base n\'en a qu\'une', () => {
    const { fresh, dupes } = splitDuplicates(
      [t({ amount: 10 }), t({ amount: 10 })],
      [{ date: '2026-01-05', label: 'x', amount: 10 }],
    );
    expect(dupes.length).toBe(1);
    expect(fresh.length).toBe(1);
  });

  it('converge : réimporter le même fichier ne crée aucun nouveau', () => {
    const file = [t({ amount: 10 }), t({ amount: 10 })];
    const existing = file.map(f => ({ date: f.date, label: f.label, amount: f.amount }));
    const { fresh } = splitDuplicates(file, existing);
    expect(fresh.length).toBe(0);
  });
});

describe('parseAmount / parseDate (rappel de couverture)', () => {
  it('parse un montant français', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56);
  });
  it('parse une date JJ/MM/AAAA sans décalage', () => {
    expect(parseDate('31/03/2026')).toBe('2026-03-31');
  });
});
