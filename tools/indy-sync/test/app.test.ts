// Reprise réseau sur l'écriture dans l'app (fonction indy_sync), sans réseau.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppUnreachable, syncWithApp, type Rpc } from '../src/app.ts';
import { journal } from '../src/outils.ts';

const result = (nouvelles: number) => ({
  factures: { nouvelles: Array.from({ length: nouvelles }, (_, i) => ({ number: `F${i}` })), mises_a_jour: [], inchangees: 44, ecarts: [] },
  devis: { nouveaux: [], mis_a_jour: [], inchanges: 31 },
});
const ok = (n: number) => ({ status: 200, text: JSON.stringify(result(n)) });

/** Fausse app : `plan` décide de la réponse de chaque appel, dans l'ordre (dry = calcul à blanc). */
function fakeApp(plan: (n: number, dry: boolean) => { status: number; text: string } | Error) {
  const calls: boolean[] = [];
  const rpc: Rpc = async (_fn, body) => {
    calls.push(body.p_dry_run as boolean);
    const r = plan(calls.length, body.p_dry_run as boolean);
    if (r instanceof Error) throw r;
    return r;
  };
  return { rpc, calls };
}

function quiet() {
  const original = console.log;
  console.log = () => {};
  const sleeps: number[] = [];
  journal.length = 0;
  return { retry: { sleep: async (ms: number) => { sleeps.push(ms); } }, sleeps, restore: () => { console.log = original; } };
}

test('coupure pendant l\'écriture puis succès : écrit, détail du calcul repris', async () => {
  const q = quiet();
  try {
    const { rpc, calls } = fakeApp((n, dry) => (dry ? ok(3) : n <= 3 ? new Error('fetch failed (ECONNRESET)') : ok(3)));
    const r = await syncWithApp([], [], false, q.retry, rpc);
    assert.equal(r?.factures.nouvelles.length, 3);
    assert.deepEqual(calls, [true, false, false, false]);
    assert.deepEqual(q.sleeps, [30_000, 120_000]);
    assert.ok(journal.some(l => l.includes("L'app Nowadays Finance ne répond pas (fetch failed (ECONNRESET)), nouvelle tentative 2/4 dans 30 s")));
  } finally { q.restore(); }
});

test('réponse perdue après une écriture appliquée : l\'e-mail garde les 3 nouvelles factures', async () => {
  const q = quiet();
  try {
    // 1re écriture appliquée côté app mais réponse perdue ; la 2e ne voit plus rien à changer.
    const { rpc } = fakeApp((n, dry) => (dry ? ok(3) : n === 2 ? new Error('signal timed out') : ok(0)));
    const r = await syncWithApp([], [], false, q.retry, rpc);
    assert.equal(r?.factures.nouvelles.length, 3);
    assert.ok(journal.some(l => l.includes('Écriture réussie après reprise')));
  } finally { q.restore(); }
});

test('passerelle indisponible (HTTP 503) : reprise ; refus de l\'app (400) : jamais réessayé', async () => {
  const q = quiet();
  try {
    const a = fakeApp((n, dry) => (dry ? ok(1) : n === 2 ? new Error('HTTP 503') : ok(1)));
    assert.equal((await syncWithApp([], [], false, q.retry, a.rpc))?.factures.nouvelles.length, 1);
    const b = fakeApp((_n, dry) => (dry ? ok(1) : { status: 400, text: 'cle de synchronisation inconnue' }));
    await assert.rejects(syncWithApp([], [], false, q.retry, b.rpc), /l'app a refusé l'écriture \(400\)/);
    assert.deepEqual(b.calls, [true, false]);
    assert.deepEqual(q.sleeps, [30_000]);
  } finally { q.restore(); }
});

test('4 échecs réseau : arrêt « app injoignable », à blanc aucune écriture tentée', async () => {
  const q = quiet();
  try {
    const { rpc, calls } = fakeApp((_n, dry) => (dry ? ok(1) : new Error('fetch failed (ENOTFOUND)')));
    await assert.rejects(syncWithApp([], [], false, q.retry, rpc), (err: unknown) => {
      assert.ok(err instanceof AppUnreachable);
      assert.equal(err.message, "écriture dans l'app : fetch failed (ENOTFOUND) à chacune des 4 tentatives sur 7 min 30 s");
      return true;
    });
    assert.equal(calls.length, 5);
    const dry = fakeApp(() => ok(2));
    assert.equal((await syncWithApp([], [], true, q.retry, dry.rpc))?.factures.nouvelles.length, 2);
    assert.deepEqual(dry.calls, [true]);
  } finally { q.restore(); }
});
