// Tests de la composition des e-mails de fin de synchro (sans envoi).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeStop, composeSuccess } from '../src/courriel.ts';

const lines = ['[02/11/2026 08:00:01] Début de la synchronisation Indy', '[02/11/2026 08:00:30] Fin, sans erreur'];

test('succès avec changements : le résumé dans l\'objet, le journal dans le corps', () => {
  const m = composeSuccess('02/11/2026', 'factures : 2 nouvelles, 0 mises à jour, 44 inchangées · devis : 0 nouveaux, 1 mis à jour, 30 inchangés', false, lines);
  assert.equal(m.subject, 'Synchro Indy du 02/11/2026 : factures : 2 nouvelles, 0 mises à jour, 44 inchangées · devis : 0 nouveaux, 1 mis à jour, 30 inchangés');
  assert.match(m.body, /^Écrit dans l'app : factures : 2 nouvelles/);
  assert.ok(m.body.endsWith(lines.join('\n')));
});

test('succès sans changement : « rien de nouveau »', () => {
  const m = composeSuccess('02/11/2026', 'factures : 0 nouvelles, 0 mises à jour, 44 inchangées · devis : 0 nouveaux, 0 mis à jour, 31 inchangés', true, lines);
  assert.equal(m.subject, 'Synchro Indy du 02/11/2026 : rien de nouveau');
  assert.match(m.body, /^Rien de nouveau dans Indy .*44 inchangées/);
});

test('arrêt : le motif dans l\'objet, quoi faire et « rien n\'est écrit » dans le corps', () => {
  const m = composeStop('02/11/2026', 'session Indy expirée', 'Lancer « npm run connexion » dans tools/indy-sync.', lines);
  assert.equal(m.subject, 'Synchro Indy du 02/11/2026 : ARRÊT (session Indy expirée)');
  assert.match(m.body, /^Lancer « npm run connexion »/);
  assert.match(m.body, /Rien n'est écrit dans l'app\./);
  assert.ok(m.body.includes('Journal :\n[02/11/2026 08:00:01]'));
});
