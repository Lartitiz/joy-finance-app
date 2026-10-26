// Appels aux fonctions de l'app Nowadays Finance (Supabase), avec la clé de synchronisation.
import type { DigestData } from '../../../src/lib/digest-utils.ts';
import { withRetry, type RetryOptions } from './indy.ts';
import { envValue, journal, log, readKey } from './outils.ts';
import type { SyncResult } from './semaine.ts';

/** L'app n'a répondu à aucune des tentatives : erreur réseau, rien n'est écrit (ou déjà tout). */
export class AppUnreachable extends Error {}

export type Rpc = (fn: string, body: Record<string, unknown>) => Promise<{ status: number; text: string } | null>;

/** Appelle une fonction SQL de l'app. null si la clé de synchronisation est absente. */
export async function appRpc(fn: string, body: Record<string, unknown>): Promise<{ status: number; text: string } | null> {
  const url = envValue('VITE_SUPABASE_URL');
  const publicKey = envValue('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !publicKey) throw new Error('adresse ou clé publique de l\'app introuvable dans le .env');
  const key = readKey();
  if (!key) return null;
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, ...body }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    // Messages reconnus par networkReason (indy.ts) : erreurs réseau, à réessayer.
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('signal timed out');
    throw new Error(`fetch failed${e.cause?.code ? ` (${e.cause.code})` : ''}`);
  }
  // Passerelle indisponible : passagère, à réessayer comme une coupure réseau.
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new Error(`HTTP ${res.status}`);
  return { status: res.status, text: await res.text() };
}

const APP_WHO = 'L\'app Nowadays Finance';

/**
 * Synchronisation dans l'app (fonction indy_sync), avec reprise sur erreur réseau.
 * Toujours un calcul à blanc d'abord : l'écriture se rejoue sans risque (ajouts et mises à
 * jour par numéro), mais si sa réponse se perd après avoir été appliquée, le nouvel essai ne
 * voit plus rien à changer. Le détail de l'e-mail vient alors du calcul fait juste avant.
 * null si la clé est absente ou la fonction pas installée (à blanc seulement).
 */
export async function syncWithApp(
  invoices: unknown[], quotes: unknown[], dryRun: boolean, retry: RetryOptions = {}, rpc: Rpc = appRpc,
): Promise<SyncResult | null> {
  const opts: RetryOptions = { ...retry, who: APP_WHO, giveUp: m => new AppUnreachable(m) };
  const call = (dry: boolean) => withRetry(dry ? 'calcul dans l\'app' : 'écriture dans l\'app',
    () => rpc('indy_sync', { p_invoices: invoices, p_quotes: quotes, p_dry_run: dry }), opts);
  const parse = (res: { status: number; text: string }, verb: string): SyncResult => {
    if (res.status < 200 || res.status >= 300) throw new Error(`l'app a refusé ${verb} (${res.status}) : ${res.text.slice(0, 300)}`);
    return JSON.parse(res.text) as SyncResult;
  };

  const preview = await call(true);
  if (!preview) {
    if (dryRun) return null;
    throw new Error('clé de synchronisation absente du trousseau (lancer npm run cle)');
  }
  if (preview.status === 404 && dryRun) return null;
  const planned = parse(preview, 'le calcul');
  if (dryRun) return planned;

  const retriesBefore = journal.filter(l => l.includes('nouvelle tentative')).length;
  const written = parse((await call(false))!, 'l\'écriture');
  if (journal.filter(l => l.includes('nouvelle tentative')).length > retriesBefore) {
    log('Écriture réussie après reprise : le détail vient du calcul fait juste avant (la première réponse a pu se perdre).');
    return planned;
  }
  return written;
}

/** Factures non payées, relances notées et devis ouverts (fonction finance_digest, lecture seule). */
export async function readDigest(): Promise<DigestData> {
  const res = await appRpc('finance_digest', {});
  if (!res) throw new Error('clé de synchronisation absente du trousseau (lancer npm run cle)');
  if (res.status !== 200) throw new Error(`l'app a refusé la lecture (${res.status}) : ${res.text.slice(0, 300)}`);
  return JSON.parse(res.text) as DigestData;
}

/** Comme readDigest, mais null au lieu d'une erreur (l'e-mail part quand même, en plus court). */
export async function readDigestSafe(): Promise<DigestData | null> {
  try {
    return await readDigest();
  } catch {
    return null;
  }
}

/** Date AAAA-MM-JJ (heure de Paris) d'un horodatage renvoyé par l'app. */
export function parisDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}
