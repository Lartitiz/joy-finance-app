// Appels aux fonctions de l'app Nowadays Finance (Supabase), avec la clé de synchronisation.
import type { DigestData } from '../../../src/lib/digest-utils.ts';
import { envValue, readKey } from './outils.ts';

/** Appelle une fonction SQL de l'app. null si la clé de synchronisation est absente. */
export async function appRpc(fn: string, body: Record<string, unknown>): Promise<{ status: number; text: string } | null> {
  const url = envValue('VITE_SUPABASE_URL');
  const publicKey = envValue('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !publicKey) throw new Error('adresse ou clé publique de l\'app introuvable dans le .env');
  const key = readKey();
  if (!key) return null;
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key, ...body }),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: res.status, text: await res.text() };
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
