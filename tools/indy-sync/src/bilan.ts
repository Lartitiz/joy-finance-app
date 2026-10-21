// Bilan mensuel : factures à relancer et devis à trancher. Usage :
//   npm run bilan    affiche l'objet puis le texte de l'e-mail, sans rien écrire
// Lecture seule dans l'app (fonction finance_digest, même clé que la synchro).
// L'envoi de l'e-mail est fait par la tâche programmée de Claude du 1er du mois.
import { buildDigest, type DigestData } from '../../../src/lib/digest-utils.ts';
import { envValue, readKey } from './outils.ts';

async function readDigest(): Promise<DigestData> {
  const url = envValue('VITE_SUPABASE_URL');
  const publicKey = envValue('VITE_SUPABASE_PUBLISHABLE_KEY');
  const key = readKey();
  if (!url || !publicKey) throw new Error('adresse ou clé publique de l\'app introuvable dans le .env');
  if (!key) throw new Error('clé de synchronisation absente du trousseau (lancer npm run cle)');
  const res = await fetch(`${url}/rest/v1/rpc/finance_digest`, {
    method: 'POST',
    headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`l'app a refusé la lecture (${res.status}) : ${text.slice(0, 300)}`);
  return JSON.parse(text) as DigestData;
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

readDigest().then((data) => {
  const { subject, body } = buildDigest(data, today);
  console.log(`OBJET : ${subject}\n\n${body}`);
}).catch((err: unknown) => {
  console.error(`ARRÊT : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
