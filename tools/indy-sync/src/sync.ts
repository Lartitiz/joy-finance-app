// Synchronisation Indy -> app. Usage :
//   npm run dry-run   lit Indy et affiche ce qui serait écrit, sans rien écrire
//   npm run sync      lit Indy et écrit dans l'app (ajouts et mises à jour)
// Lecture seule sur Indy : uniquement des requêtes GET, aucun clic.
// Erreur réseau au départ (Wi-Fi pas remonté) : jusqu'à 3 nouvelles tentatives, voir indy.ts.
import { chromium } from 'playwright';
import { FormatError, type InvoiceRow, type QuoteRow } from './format.ts';
import { IndyUnreachable, SessionExpired, readIndyFromPage } from './indy.ts';
import { composeStop, composeSuccess, sendMail } from './courriel.ts';
import { CHROME_OPTIONS, PROFILE_DIR, envValue, journal, log, notify, readKey, today } from './outils.ts';

const DRY_RUN = process.argv.includes('--dry-run');

async function readIndy(): Promise<{ invoices: InvoiceRow[]; quotes: QuoteRow[] }> {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { ...CHROME_OPTIONS, headless: true })
    .catch((err: Error) => {
      throw new Error(/ProcessSingleton|SingletonLock|already in use/i.test(err.message)
        ? 'le Chrome de connexion Indy est encore ouvert : le quitter (Cmd+Q) puis relancer'
        : `Chrome ne démarre pas (${err.message.split('\n')[0]})`);
    });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    return await readIndyFromPage(page);
  } finally {
    await context.close();
  }
}

interface SyncResult {
  factures: { nouvelles: InvoiceRow[]; mises_a_jour: { number: string; avant: object; apres: object }[]; inchangees: number; ecarts: { number: string; ecart: string }[] };
  devis: { nouveaux: QuoteRow[]; mis_a_jour: { number: string; avant: string; apres: string }[]; inchanges: number };
}

/** Appelle la fonction indy_sync de l'app. null si elle n'est pas encore installée. */
async function callApp(invoices: InvoiceRow[], quotes: QuoteRow[], dryRun: boolean): Promise<SyncResult | null> {
  const url = envValue('VITE_SUPABASE_URL');
  const publicKey = envValue('VITE_SUPABASE_PUBLISHABLE_KEY');
  const key = readKey();
  if (!url || !publicKey) throw new Error('adresse ou clé publique de l\'app introuvable dans le .env');
  if (!key) {
    if (dryRun) return null;
    throw new Error('clé de synchronisation absente du trousseau (lancer npm run cle)');
  }
  const res = await fetch(`${url}/rest/v1/rpc/indy_sync`, {
    method: 'POST',
    headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key, p_invoices: invoices, p_quotes: quotes, p_dry_run: dryRun }),
  });
  const text = await res.text();
  if (res.status === 404 && dryRun) return null;
  if (!res.ok) throw new Error(`l'app a refusé l'écriture (${res.status}) : ${text.slice(0, 300)}`);
  return JSON.parse(text) as SyncResult;
}

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '-');

function printRead(invoices: InvoiceRow[], quotes: QuoteRow[]): void {
  log(`Lu dans Indy : ${invoices.length} factures, ${quotes.length} devis (totaux contrôlés : identiques à Indy)`);
  for (const i of invoices) {
    log(`  facture ${i.number} · ${i.client_name} · ${eur(i.amount)} · émise ${fr(i.date_issued)} · échéance ${fr(i.date_due)} · ${i.status}`);
  }
  for (const q of quotes) {
    log(`  devis ${q.number} · ${q.client_name} · ${eur(q.amount)} · ${fr(q.date_issued)} · ${q.status}`);
  }
}

function printResult(r: SyncResult, dryRun: boolean): string {
  const verb = dryRun ? 'serait' : 'a été';
  const f = r.factures;
  const d = r.devis;
  for (const i of f.nouvelles) log(`  + facture ${i.number} · ${i.client_name} · ${eur(i.amount)} · ${i.status} (${verb} ajoutée)`);
  for (const u of f.mises_a_jour) log(`  ~ facture ${u.number} : ${JSON.stringify(u.avant)} -> ${JSON.stringify(u.apres)}`);
  for (const e of f.ecarts) log(`  ! facture ${e.number} : ${e.ecart} (l'app n'est pas modifiée sur ce point)`);
  for (const q of d.nouveaux) log(`  + devis ${q.number} · ${q.client_name} · ${eur(q.amount)} · ${q.status} (${verb} ajouté)`);
  for (const u of d.mis_a_jour) log(`  ~ devis ${u.number} : ${u.avant} -> ${u.apres}`);
  const summary = `factures : ${f.nouvelles.length} nouvelles, ${f.mises_a_jour.length} mises à jour, ${f.inchangees} inchangées`
    + (f.ecarts.length ? `, ${f.ecarts.length} écarts` : '')
    + ` · devis : ${d.nouveaux.length} nouveaux, ${d.mis_a_jour.length} mis à jour, ${d.inchanges} inchangés`;
  log(`${dryRun ? 'À BLANC, rien n\'est écrit' : 'Écrit dans l\'app'} : ${summary}`);
  return summary;
}

async function main(): Promise<void> {
  log(`Début ${DRY_RUN ? 'du test à blanc' : 'de la synchronisation'} Indy`);
  const { invoices, quotes } = await readIndy();
  const result = await callApp(invoices, quotes, DRY_RUN);
  if (!result) {
    printRead(invoices, quotes);
    log('À BLANC : comparaison avec l\'app impossible (fonction indy_sync pas encore installée ou clé absente). Rien n\'est écrit.');
    return;
  }
  const summary = printResult(result, DRY_RUN);
  if (DRY_RUN) return;
  const changed = Boolean(result.factures.nouvelles.length || result.factures.mises_a_jour.length
    || result.factures.ecarts.length || result.devis.nouveaux.length || result.devis.mis_a_jour.length);
  if (changed) notify('Indy : synchronisation faite', summary);
  sendMail(composeSuccess(today(), summary, !changed, journal));
}

/** Arrêt propre : journal, notification, e-mail (sauf à blanc), code de sortie. */
function stop(what: string, detail: string, code: number): never {
  log(`ARRÊT (${what}) : ${detail} Rien n'est écrit dans l'app.`);
  notify('Indy : synchronisation arrêtée', `${what} : ${detail}`.slice(0, 200));
  if (!DRY_RUN) sendMail(composeStop(today(), what, detail, journal));
  process.exit(code);
}

main().then(() => log('Fin, sans erreur')).catch((err: unknown) => {
  if (err instanceof SessionExpired) {
    stop('session Indy expirée', 'Lancer « npm run connexion » dans tools/indy-sync, se connecter à Indy, puis quitter ce Chrome avec Cmd+Q.', 2);
  }
  if (err instanceof IndyUnreachable) {
    stop('Indy injoignable', `${err.message}. Vérifier le Wi-Fi du Mac ; prochaine synchro lundi prochain.`, 3);
  }
  const msg = err instanceof Error ? err.message : String(err);
  stop(err instanceof FormatError ? 'la structure des données Indy a changé' : 'erreur', `${msg}.`, 1);
});
