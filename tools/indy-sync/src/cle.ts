// Crée la clé de synchronisation : la clé va dans le trousseau macOS, seule son
// empreinte est affichée, dans la requête SQL à lancer une fois côté app.
import { createHash, randomBytes } from 'node:crypto';
import { readKey, saveKey } from './outils.ts';

if (readKey() && !process.argv.includes('--remplacer')) {
  console.log('Une clé existe déjà dans le trousseau. Pour la remplacer : npm run cle -- --remplacer');
  process.exit(1);
}

const key = randomBytes(32).toString('base64url');
saveKey(key);
const hash = createHash('sha256').update(key, 'utf8').digest('hex');
console.log('Clé enregistrée dans le trousseau (service « nowadays-indy-sync »).');
const email = process.argv.find(a => a.includes('@')) ?? 'TON_EMAIL_DE_CONNEXION';
console.log('Requête à lancer une fois dans l\'éditeur SQL de l\'app :\n');
console.log(`INSERT INTO public.sync_keys (user_id, key_hash, label)
SELECT id, '${hash}', 'indy-sync (Mac)' FROM auth.users WHERE email = '${email}';`);
