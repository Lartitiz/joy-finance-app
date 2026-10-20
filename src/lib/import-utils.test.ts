import { describe, it, expect } from 'vitest';
import { dedupKey, normalizeLabel, splitDuplicates, parseAmount, parseDate, autoMapColumns, dateSpan, type ParsedTransaction } from './import-utils';

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

describe('normalizeLabel / dedupKey : doublons du T1 2026', () => {
  it('reconnaît la forme enrichie « … | … » comme le même libellé', () => {
    expect(normalizeLabel('Vir Sepa Stripe | VIR SEPA STRIPE')).toBe(normalizeLabel('VIR SEPA STRIPE'));
    expect(dedupKey({ date: '2026-02-10', label: 'Vir Sepa Stripe | VIR SEPA STRIPE', amount: 1250.5 }))
      .toBe(dedupKey({ date: '2026-02-10', label: 'VIR SEPA STRIPE', amount: '1250.50' }));
  });

  it('ignore accents et ponctuation', () => {
    expect(normalizeLabel('Prélèvement URSSAF - Février')).toBe(normalizeLabel('PRELEVEMENT URSSAF FEVRIER'));
  });

  it('distingue le sens (entrée ou sortie du même montant)', () => {
    expect(dedupKey({ date: '2026-01-05', label: 'x', amount: 100 }))
      .not.toBe(dedupKey({ date: '2026-01-05', label: 'x', amount: -100 }));
  });

  it('distingue deux libellés vraiment différents', () => {
    expect(normalizeLabel('VIR SEPA CLIENT A')).not.toBe(normalizeLabel('VIR SEPA CLIENT B'));
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

describe('splitDuplicates : doublons probables', () => {
  const t = (p: Partial<ParsedTransaction>): ParsedTransaction => ({ date: '2026-01-05', label: 'x', amount: 10, ...p });

  it('met à part même date + même montant avec un libellé différent', () => {
    const { fresh, dupes, probables } = splitDuplicates(
      [t({ label: 'STRIPE PAYOUT', amount: 300 }), t({ label: 'autre', amount: 40 })],
      [{ date: '2026-01-05', label: 'VIR SEPA STRIPE', amount: 300 }],
    );
    expect(dupes).toEqual([]);
    expect(probables.map(p => p.amount)).toEqual([300]);
    expect(fresh.map(f => f.amount)).toEqual([40]);
  });

  it("une ligne en base déjà reconnue à l'identique ne sert pas une 2e fois", () => {
    const { dupes, probables, fresh } = splitDuplicates(
      [t({ label: 'VIR SEPA STRIPE', amount: 300 }), t({ label: 'STRIPE', amount: 300 })],
      [{ date: '2026-01-05', label: 'Vir Sepa Stripe | VIR SEPA STRIPE', amount: 300 }],
    );
    expect(dupes.length).toBe(1);
    expect(probables.length).toBe(0);
    expect(fresh.length).toBe(1);
  });
});

describe('autoMapColumns', () => {
  it("préfère la date d'opération à la date de valeur, quel que soit l'ordre", () => {
    const m = autoMapColumns(['Date de valeur', "Date d'opération", 'Libellé', 'Montant']);
    expect(m["Date d'opération"]).toBe('date');
    expect(m['Date de valeur']).toBe('ignore');
    expect(m['Montant']).toBe('amount_single');
  });

  it('préfère « Libellé » à « Référence »', () => {
    const m = autoMapColumns(['Date', 'Référence', 'Libellé', 'Débit', 'Crédit']);
    expect(m['Libellé']).toBe('label');
    expect(m['Référence']).toBe('ignore');
    expect(m['Débit']).toBe('amount_debit');
    expect(m['Crédit']).toBe('amount_credit');
  });

  it('« Date ; Valeur » : la colonne Date gagne', () => {
    const m = autoMapColumns(['Date', 'Valeur', 'Libellé', 'Montant']);
    expect(m['Date']).toBe('date');
    expect(m['Valeur']).toBe('ignore');
  });
});

describe('parseDate : pas de décalage de jour', () => {
  it('garde le jour écrit quand une heure suit la date', () => {
    expect(parseDate('2026-04-01 00:30:00')).toBe('2026-04-01');
    expect(parseDate('2026-03-31T23:30:00Z')).toBe('2026-03-31');
    expect(parseDate('31/03/2026 23:59')).toBe('2026-03-31');
  });
  it('lit une date Excel stockée en nombre', () => {
    expect(parseDate('46112')).toBe('2026-03-31');
  });
});

describe('dateSpan', () => {
  it('donne la première et la dernière date du fichier', () => {
    expect(dateSpan([
      { date: '2026-03-02', label: 'a', amount: 1 },
      { date: '2026-01-15', label: 'b', amount: 1 },
    ])).toEqual({ start: '2026-01-15', end: '2026-03-02' });
    expect(dateSpan([])).toBeNull();
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
