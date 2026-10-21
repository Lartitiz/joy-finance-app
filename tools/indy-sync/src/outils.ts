// Petits outils partagés : chemins, journal, notification macOS, trousseau, .env.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Profil dédié du vrai Google Chrome (Google refuse souvent la connexion dans
// le Chromium de test). Le même navigateur ouvre le profil à la connexion et
// pendant la synchronisation, sinon les cookies chiffrés seraient illisibles.
export const PROFILE_DIR = join(homedir(), 'Library/Application Support/nowadays-indy-sync/profil-chrome');
export const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Options Playwright : vrai Chrome, trousseau réel (pas le trousseau factice par défaut). */
export const CHROME_OPTIONS = {
  channel: 'chrome',
  ignoreDefaultArgs: ['--use-mock-keychain', '--enable-automation'],
};
export const KEYCHAIN_SERVICE = 'nowadays-indy-sync';
export const KEYCHAIN_ACCOUNT = 'cle-synchronisation';
export const INDY = 'https://app.indy.fr';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = join(HERE, '..');
export const REPO_DIR = join(TOOL_DIR, '../..');

export function log(msg: string): void {
  const t = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  console.log(`[${t}] ${msg}`);
}

/** Notification macOS (sans effet si osascript échoue). */
export function notify(title: string, message: string): void {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try {
    execFileSync('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}"`]);
  } catch {
    log('notification macOS impossible');
  }
}

export function readKey(): string | null {
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

export function saveKey(key: string): void {
  execFileSync('security', ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w', key]);
}

/** Lit une variable dans tools/indy-sync/.env, sinon dans le .env de l'app (adresse et clé publique). */
export function envValue(name: string): string | null {
  for (const file of [join(TOOL_DIR, '.env'), join(REPO_DIR, '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && m[1] === name) return m[2];
    }
  }
  return process.env[name] ?? null;
}
