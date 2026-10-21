// Synchronisation Indy -> app. Usage :
//   npm run dry-run   lit Indy et affiche ce qui serait écrit, sans rien écrire
//   npm run sync      lit Indy et écrit dans l'app (ajouts et mises à jour)
// Lecture seule sur Indy : uniquement des requêtes GET, aucun clic.
import { chromium, type Page } from 'playwright';
import {
  FormatError, checkTotals, readPage, readTotals, toInvoiceRow, toQuoteRow,
  type InvoiceRow, type QuoteRow,
} from './format.ts';
import { CHROME_OPTIONS, INDY, PROFILE_DIR, envValue, log, notify, readKey } from './outils.ts';

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 100;

class SessionExpired extends Error {}

/** GET sur l'API d'Indy depuis la page, avec les cookies du profil dédié. */
async function indyGet(page: Page, path: string): Promise<unknown> {
  const res = await page.evaluate(async (p) => {
    const r = await fetch(p, { method: 'GET', credentials: 'include', headers: { accept: 'application/json' } });
    return { status: r.status, text: await r.text() };
  }, path);
  if (res.status === 401 || res.status === 403) throw new SessionExpired();
  if (res.status !== 200) throw new FormatError(`Indy a répondu ${res.status} sur ${path.split('?')[0]}`);
  try {
    return JSON.parse(res.text);
  } catch {
    throw new FormatError(`réponse Indy illisible sur ${path.split('?')[0]}`);
  }
}

async function readAll(page: Page, path: string, key: string): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { items, total } = readPage(await indyGet(page, `${path}?start=${start}&limit=${PAGE_SIZE}`), key);
    all.push(...items);
    if (items.length === 0 || all.length >= total) {
      if (all.length !== total) throw new FormatError(`liste « ${key} » incomplète : ${all.length} lus sur ${total}`);
      return all;
    }
  }
}

async function readIndy(): Promise<{ invoices: InvoiceRow[]; quotes: QuoteRow[] }> {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { ...CHROME_OPTIONS, headless: true })
    .catch((err: Error) => {
      throw new Error(/ProcessSingleton|SingletonLock|already in use/i.test(err.message)
        ? 'le Chrome de connexion Indy est encore ouvert : le quitter (Cmd+Q) puis relancer'
        : `Chrome ne démarre pas (${err.message.split('\n')[0]})`);
    });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${INDY}/facturation/factures`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await indyGet(page, '/api/end-user/me');

    const rawInvoices = await readAll(page, '/api/facturation-invoices/documents/invoices', 'invoices');
    const rawQuotes = await readAll(page, '/api/facturation-invoices/documents/quotations', 'quotations');
    const totals = readTotals(
      await indyGet(page, '/api/facturation/invoices/kpis'),
      await indyGet(page, '/api/facturation/quotations/kpis'),
      await indyGet(page, '/api/facturation/invoices/count'),
      await indyGet(page, '/api/facturation/quotations/count'),
    );

    const invoices = rawInvoices.map(toInvoiceRow);
    const invoicedQuoteIds = new Set(rawInvoices
      .map(i => (i as Record<string, unknown>).fromQuotationId)
      .filter((id): id is string => typeof id === 'string'));
    const quotes = rawQuotes.map(q => toQuoteRow(q, invoicedQuoteIds));

    const numbers = [...invoices, ...quotes].map(r => r.number);
    const dup = numbers.find((n, i) => numbers.indexOf(n) !== i);
    if (dup) throw new FormatError(`numéro en double dans Indy : ${dup}`);

    const gaps = checkTotals(invoices, quotes, totals);
    if (gaps.length) throw new FormatError(`les totaux ne concordent pas avec Indy (${gaps.join(' ; ')})`);
    return { invoices, quotes };
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
  if (!DRY_RUN && (result.factures.nouvelles.length || result.factures.mises_a_jour.length
      || result.factures.ecarts.length || result.devis.nouveaux.length || result.devis.mis_a_jour.length)) {
    notify('Indy : synchronisation faite', summary);
  }
}

main().then(() => log('Fin, sans erreur')).catch((err: unknown) => {
  if (err instanceof SessionExpired) {
    log('ARRÊT : session Indy expirée. Lancer « npm run connexion » dans tools/indy-sync. Rien n\'est écrit.');
    notify('Indy : reconnexion nécessaire', 'Ouvre tools/indy-sync et lance npm run connexion.');
    process.exit(2);
  }
  const msg = err instanceof Error ? err.message : String(err);
  const what = err instanceof FormatError ? 'la structure des données Indy a changé' : 'erreur';
  log(`ARRÊT (${what}) : ${msg}. Rien n'est écrit dans l'app.`);
  notify('Indy : synchronisation arrêtée', `${what} : ${msg}`.slice(0, 200));
  process.exit(1);
});
