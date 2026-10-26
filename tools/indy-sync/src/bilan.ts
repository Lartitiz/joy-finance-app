// Aperçu de l'e-mail du lundi, sans synchro ni envoi. Usage :
//   npm run bilan    affiche l'objet puis le texte, sur les données actuelles de l'app
// Lecture seule dans l'app (fonction finance_digest, même clé que la synchro).
// L'e-mail lui-même part après chaque synchro du lundi (courriel.ts).
import { buildWeekly, dateFr, todayParis } from '../../../src/lib/digest-utils.ts';
import { parisDate, readDigest } from './app.ts';

readDigest().then((data) => {
  const since = parisDate(data.derniere_synchro);
  const { subject, body } = buildWeekly(data, todayParis(), {
    changes: null,
    syncLine: `Aperçu sans synchro : données recopiées d'Indy le ${since ? dateFr(since) : '?'}.`,
  });
  console.log(`OBJET : ${subject}\n\n${body}`);
}).catch((err: unknown) => {
  console.error(`ARRÊT : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
