// E-mail du lundi, envoyé par Mail.app du Mac (AppleScript) après chaque vraie synchro,
// succès comme arrêt. Contenu : src/lib/digest-utils.ts (règles partagées avec l'app).
// Usage direct : npm run courriel   envoie un aperçu (objet préfixé « [test] ») construit
// sur les données actuelles de l'app, sans synchro.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildWeekly, dateFr, todayParis, todoAndPosition, type DigestData, type WeekChanges,
} from '../../../src/lib/digest-utils.ts';
import { parisDate, readDigest } from './app.ts';
import { EMAIL_TO, log } from './outils.ts';

export interface Courriel { subject: string; body: string }

/** Ligne d'état technique en fin d'e-mail. */
export function syncLine(start: Date, retries: number): string {
  const part = (o: Intl.DateTimeFormatOptions) => start.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...o });
  const when = `${part({ weekday: 'long' })} ${part({ day: '2-digit', month: '2-digit' })} à ${part({ hour: '2-digit', minute: '2-digit' })}`;
  return `Synchro Indy OK, ${when}${retries ? ` (après ${retries} ${retries > 1 ? 'reprises' : 'reprise'} réseau)` : ''}.`;
}

/** E-mail de succès ; sans les données de l'app (lecture impossible), un résumé court. */
export function composeWeekly(data: DigestData | null, today: string, changes: WeekChanges, line: string, summary: string): Courriel {
  if (data) return buildWeekly(data, today, { changes, syncLine: line });
  return {
    subject: `Nowadays · synchro Indy faite (${summary})`,
    body: [
      `Écrit dans l'app : ${summary}.`,
      '',
      'Les listes « à relancer » n\'ont pas pu être lues dans l\'app ce matin : les voir sur',
      'https://joy-finance-app.lovable.app/factures',
      '',
      line,
    ].join('\n'),
  };
}

/** E-mail d'arrêt : quoi faire en premier, puis les listes de la dernière synchro réussie, puis le journal. */
export function composeStop(what: string, detail: string, data: DigestData | null, today: string, lines: string[]): Courriel {
  const body = [
    `La synchro Indy s'est arrêtée : ${what}.`,
    `QUOI FAIRE : ${detail}`,
    'Rien n\'est écrit dans l\'app.',
  ];
  if (data) {
    const since = parisDate(data.derniere_synchro);
    const { todo, position } = todoAndPosition(data, today);
    body.push('', `À FAIRE CETTE SEMAINE (d'après la synchro du ${since ? dateFr(since) : '?'})`, ...todo, '', 'OÙ TU EN ES', ...position);
  }
  body.push('', 'Journal :', ...lines);
  return { subject: `Nowadays · synchro Indy arrêtée (${what})`, body: body.join('\n') };
}

const SCRIPT = `on run argv
  set {s, b, a} to argv
  tell application "Mail"
    set m to make new outgoing message with properties {subject:s, content:b, visible:false}
    tell m to make new to recipient at end of to recipients with properties {address:a}
    send m
  end tell
end run`;

/** Envoie par Mail.app. N'interrompt jamais la synchro : un échec est seulement journalisé. */
export function sendMail(mail: Courriel, to: string = EMAIL_TO): boolean {
  try {
    execFileSync('osascript', ['-e', SCRIPT, mail.subject, mail.body, to], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90_000 });
    log(`E-mail envoyé à ${to} : « ${mail.subject} »`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n').find(l => l.trim()) ?? '' : String(err);
    log(`E-mail impossible (Mail.app) : ${msg.slice(0, 200)}`);
    return false;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  log('Test d\'envoi par Mail.app (aperçu sur les données actuelles de l\'app, sans synchro)');
  readDigest().then((data) => {
    const since = parisDate(data.derniere_synchro);
    const mail = buildWeekly(data, todayParis(), {
      changes: null,
      syncLine: `Aperçu sans synchro : données recopiées d'Indy le ${since ? dateFr(since) : '?'}.`,
    });
    process.exit(sendMail({ subject: `[test] ${mail.subject}`, body: mail.body }) ? 0 : 1);
  }).catch((err: unknown) => {
    log(`ARRÊT : ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
