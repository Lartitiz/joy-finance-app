// Tests de la composition des e-mails (sans envoi).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DigestData, WeekChanges } from '../../../src/lib/digest-utils.ts';
import { composeStop, composeWeekly, syncLine } from '../src/courriel.ts';

const data: DigestData = {
  derniere_synchro: '2026-10-26T06:01:12+00:00',
  factures: [{ id: 'a', number: 'F1', client_name: 'Yvan Ensco', amount: 400, date_issued: '2026-05-10', date_due: '2026-06-10', status: 'sent', paid_date: null }],
  relances: [],
  devis: [],
};
const noChange: WeekChanges = { since: '2026-10-26', paid: [], invoiced: [], creditNotes: [], cancelledInvoices: [], newQuotes: [], signedQuotes: [], refusedQuotes: [], gaps: [] };

test('ligne technique : jour, date, heure de Paris, reprises réseau', () => {
  const d = new Date('2026-11-02T07:01:00Z');
  assert.equal(syncLine(d, 0), 'Synchro Indy OK, lundi 02/11 à 08:01.');
  assert.equal(syncLine(d, 2), 'Synchro Indy OK, lundi 02/11 à 08:01 (après 2 reprises réseau).');
});

test('succès : e-mail complet quand l\'app est lisible, court sinon', () => {
  const full = composeWeekly(data, '2026-11-02', noChange, 'Synchro Indy OK.', 'factures : …');
  assert.match(full.subject, /^Nowadays · 1 client à relancer · 400,00 € à encaisser$/);
  assert.match(full.body, /^À FAIRE CETTE SEMAINE\n- Relancer Yvan Ensco : 400,00 €, 145 j de retard, jamais relancé/);
  const short = composeWeekly(null, '2026-11-02', noChange, 'Synchro Indy OK.', 'factures : 1 nouvelle');
  assert.equal(short.subject, 'Nowadays · synchro Indy faite (factures : 1 nouvelle)');
  assert.match(short.body, /n'ont pas pu être lues/);
});

test('arrêt : motif dans l\'objet, quoi faire d\'abord, listes de la dernière synchro, journal', () => {
  const m = composeStop('session Indy expirée', 'Lancer « npm run connexion ».', data, '2026-11-02', ['[02/11/2026 08:00:01] Début']);
  assert.equal(m.subject, 'Nowadays · synchro Indy arrêtée (session Indy expirée)');
  assert.match(m.body, /^La synchro Indy s'est arrêtée : session Indy expirée\.\nQUOI FAIRE : Lancer « npm run connexion »\.\nRien n'est écrit dans l'app\./);
  assert.match(m.body, /À FAIRE CETTE SEMAINE \(d'après la synchro du 26\/10\/2026\)\n- Relancer Yvan Ensco/);
  assert.ok(m.body.endsWith('Journal :\n[02/11/2026 08:00:01] Début'));
  const bare = composeStop('Indy injoignable', 'Vérifier le Wi-Fi.', null, '2026-11-02', []);
  assert.doesNotMatch(bare.body, /À FAIRE/);
});
