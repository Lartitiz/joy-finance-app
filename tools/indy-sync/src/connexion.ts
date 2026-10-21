// Première connexion (ou reconnexion) : ouvre le vrai Google Chrome sur le
// profil dédié, sans pilotage, comme si on l'ouvrait à la main. On se connecte
// à Indy, puis on quitte ce Chrome (Cmd+Q) : les cookies restent dans le profil.
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHROME_BIN, INDY, PROFILE_DIR, log } from './outils.ts';

mkdirSync(PROFILE_DIR, { recursive: true });
spawn(CHROME_BIN, [
  `--user-data-dir=${PROFILE_DIR}`, '--no-first-run', '--no-default-browser-check',
  `${INDY}/facturation/factures`,
], { stdio: 'ignore', detached: true }).unref();
log('Connecte-toi à Indy dans la fenêtre Chrome ouverte, puis quitte ce Chrome avec Cmd+Q.');

// Chrome peut se relancer lui-même au démarrage : on attend donc que le verrou
// du profil disparaisse, pas la fin du premier processus.
const lock = join(PROFILE_DIR, 'SingletonLock');
const held = () => { try { return existsSync(lock) || lstatSync(lock).isSymbolicLink(); } catch { return false; } };
await new Promise(r => setTimeout(r, 5000));
while (held()) await new Promise(r => setTimeout(r, 2000));
log('Chrome de connexion fermé. Vérifier avec : npm run dry-run');
