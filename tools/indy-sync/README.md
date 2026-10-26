# Synchronisation Indy -> Nowadays Finance

Chaque lundi à 8 h, ce script lit dans Indy les factures de vente et les devis,
puis met à jour les tables `invoices` (factures émises) et `quotes` (devis) de
l'app. Sans IA. Lecture seule sur Indy : uniquement des lectures, aucun clic.
Dans l'app : ajouts et mises à jour, jamais de suppression.

## Ce qu'il fait

- **Factures** : reconnues par leur numéro (F202610-34…). Statut payée / non
  payée, échéance = date d'émission + délai de paiement Indy. Les avoirs sont
  repris en montant négatif, comme dans Indy. Une facture cochée « Payée » dans
  l'app n'est jamais repassée en non payée : l'écart est écrit dans le journal.
- **Devis** : en attente, signé (accepté sans facture), facturé (une facture en
  est issue).
- **Garde-fou** : avant d'écrire, il compare ce qu'il a lu aux totaux affichés
  par Indy (nombre de factures et de devis, total facturé, non payées, devis
  signés, devis en attente ; le « total des devis » d'Indy = signés + en
  attente, sans les refusés). Au moindre écart, ou devant un statut ou un champ inconnu, il
  s'arrête sans rien écrire, l'explique dans le journal et envoie une
  notification macOS.
- **E-mail du lundi** : à chaque vraie synchro (pas à blanc), un e-mail part
  par Mail.app du Mac, succès comme arrêt. Voir plus bas.
- **Session Indy expirée** : arrêt propre et notification « Indy : reconnexion
  nécessaire », sans réessayer.
- **Indy injoignable** (Wi-Fi pas encore remonté au réveil du Mac, page qui ne
  charge pas) : trois nouvelles tentatives, 30 s, 2 min puis 5 min après la
  précédente, chacune notée dans le journal. Si Indy ne répond toujours pas :
  « ARRÊT (Indy injoignable) », rien n'est écrit, la synchro repassera le lundi
  suivant. Une session expirée ou une donnée inattendue n'est jamais réessayée.

## Où sont les choses

| Quoi | Où |
| --- | --- |
| Profil Chrome dédié (connexion Indy) | `~/Library/Application Support/nowadays-indy-sync/profil-chrome` |
| Clé de synchronisation | trousseau macOS, service `nowadays-indy-sync` |
| Adresse et clé publique de l'app | `.env` à la racine du dépôt (déjà présent) |
| Journal | `~/Library/Logs/nowadays-indy-sync.log` |
| Agent du lundi 8 h | `~/Library/LaunchAgents/com.nowadays.indy-sync.plist` |

La clé de synchronisation ne permet qu'une chose : appeler la fonction
`indy_sync` de l'app, qui ajoute ou met à jour factures et devis. Seule son
empreinte est gardée en base. Pour la révoquer : supprimer sa ligne dans la
table `sync_keys`.

## Installation (une fois)

```bash
cd tools/indy-sync
npm install
npx playwright install chromium
```

Google Chrome doit être installé dans `/Applications`.

## Première connexion (et reconnexion)

```bash
npm run connexion
```

Une fenêtre Chrome s'ouvre sur un profil vierge (un seul onglet, Indy). Se
connecter à Indy, puis quitter ce Chrome avec **Cmd+Q**. Les lancements
suivants réutilisent la connexion.

## Clé de synchronisation (une fois)

```bash
npm run cle -- ton-email@exemple.fr
```

La clé va dans le trousseau. La commande affiche une requête SQL (avec
l'empreinte seulement) à lancer une fois dans l'éditeur SQL de l'app, après la
migration `supabase/migrations/20261020150000_indy_sync.sql`.

## Tester

```bash
npm run dry-run     # à blanc : lit Indy, affiche ce qui serait écrit, n'écrit rien, n'envoie pas d'e-mail
npm run courriel    # envoie un aperçu de l'e-mail du lundi par Mail.app
npm run sync        # vraie synchronisation
npm test            # tests sans réseau
```

## Agent du lundi 8 h

```bash
./launchd/installer.sh                                  # installer
launchctl kickstart -k gui/$(id -u)/com.nowadays.indy-sync   # lancer tout de suite
tail -50 ~/Library/Logs/nowadays-indy-sync.log          # lire le journal
./launchd/desinstaller.sh                               # désinstaller
```

Si le Mac dort à 8 h, le script part au réveil. Le Chrome de connexion doit
être fermé pendant le lancement.

## E-mail du lundi (à faire, changements de la semaine, où tu en es)

Après chaque vraie synchro, un e-mail part par **Mail.app** du Mac (compte
configuré dans Mail, AppleScript), dans cet ordre :

1. **À faire cette semaine** : clients à relancer (plus de 30 jours de retard,
   pas relancés depuis 15 jours), devis signés à facturer, devis sans réponse
   depuis 15 jours, devis expirés à relancer ou annuler.
2. **Depuis la dernière synchro** : factures passées payées, nouvelles factures,
   avoirs, annulations, nouveaux devis, devis signés, refusés, écarts à vérifier,
   avec client et montant.
3. **Où tu en es** : total à encaisser et part en retard, échéances des 7 jours
   à venir, autres factures non payées, devis récents.
4. Une ligne technique (heure, reprises réseau éventuelles).

L'objet résume : « Nowadays · 2 clients à relancer · 1 facture payée ·
1 234,50 € à encaisser ». Si la synchro s'arrête, l'objet le dit (« Nowadays ·
synchro Indy arrêtée (session Indy expirée) ») et le corps commence par quoi
faire, suivi des listes de la dernière synchro réussie et du journal.

Règles dans `src/lib/digest-utils.ts` (les mêmes que la page Factures et le bloc
« Devis en attente ») ; tri des changements dans `src/semaine.ts`. Lecture des
listes par la fonction `finance_digest` de l'app, avec la même clé.
Destinataire : `INDY_SYNC_EMAIL` dans `tools/indy-sync/.env`, sinon l'adresse
Nowadays. Un échec d'envoi est journalisé (« E-mail impossible (Mail.app) ») et
n'arrête pas la synchro. Rien n'est jamais envoyé aux clients.

```bash
npm run bilan       # aperçu de l'e-mail sur les données actuelles de l'app (sans synchro, sans envoi)
npm run courriel    # envoie cet aperçu par Mail.app, objet préfixé « [test] »
npm run dry-run     # lit Indy et affiche l'e-mail qui partirait, sans écrire ni envoyer
```

Remplace le bilan mensuel du 1er (tâche programmée « bilan-mensuel-finance »,
désactivée le 26/10/2026).
