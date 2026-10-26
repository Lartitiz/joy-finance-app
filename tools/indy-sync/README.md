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
  par Indy (nombre de factures et de devis, total facturé, non payées, devis en
  attente). Au moindre écart, ou devant un statut ou un champ inconnu, il
  s'arrête sans rien écrire, l'explique dans le journal et envoie une
  notification macOS.
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
npm run dry-run     # à blanc : lit Indy, affiche ce qui serait écrit, n'écrit rien
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

## Bilan mensuel (factures à relancer, devis à trancher)

```bash
npm run bilan
```

Affiche l'objet et le texte d'un e-mail : clients à relancer en priorité (plus
de 30 jours de retard, pas relancés depuis 15 jours), autres factures non
payées, devis à relancer (envoyés depuis 15 jours ou plus), signés à facturer,
expirés sans réponse. Lecture seule, avec la même clé (fonction
`finance_digest`). Règles dans `src/lib/digest-utils.ts`. L'e-mail est envoyé
à Laetitia le 1er de chaque mois par la tâche programmée de Claude
« bilan-mensuel-finance ». Rien n'est envoyé aux clients.
