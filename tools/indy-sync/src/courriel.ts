// E-mail de fin de synchro, envoyé par Mail.app du Mac (AppleScript), succès comme arrêt.
// Usage direct : npm run courriel   envoie un e-mail de test au destinataire.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EMAIL_TO, log } from './outils.ts';

export interface Courriel { subject: string; body: string }

/** E-mail de succès : l'objet dit le résultat, le corps reprend le journal. */
export function composeSuccess(date: string, summary: string, nothingNew: boolean, lines: string[]): Courriel {
  return {
    subject: nothingNew ? `Synchro Indy du ${date} : rien de nouveau` : `Synchro Indy du ${date} : ${summary}`,
    body: [
      nothingNew ? `Rien de nouveau dans Indy depuis la dernière synchro (${summary}).` : `Écrit dans l'app : ${summary}.`,
      '', 'Journal :', ...lines,
    ].join('\n'),
  };
}

/** E-mail d'arrêt : le motif dans l'objet, quoi faire dans le corps. */
export function composeStop(date: string, what: string, detail: string, lines: string[]): Courriel {
  return {
    subject: `Synchro Indy du ${date} : ARRÊT (${what})`,
    body: [detail, '', 'Rien n\'est écrit dans l\'app.', '', 'Journal :', ...lines].join('\n'),
  };
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
  log('Test d\'envoi par Mail.app');
  const ok = sendMail({
    subject: 'Synchro Indy : test d\'envoi',
    body: 'Si tu lis ceci, Mail.app envoie bien les e-mails de fin de synchro.\n\nRien n\'a été lu dans Indy ni écrit dans l\'app.',
  });
  process.exit(ok ? 0 : 1);
}
