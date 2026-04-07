

## Plan : Suivi des indicateurs d'activité (Appels découverte, Clientes actives, Prospects contactés)

### Concept

Ajouter un système de suivi mensuel de 3 indicateurs d'activité commerciale :
- **Appels découverte** (☎️) — nombre d'appels découverte réalisés
- **Clientes actives** (👥) — nombre de clientes actives dans le mois
- **Prospects contactés** (🎯) — nombre de prospects contactés

Ces indicateurs sont saisis manuellement chaque mois (comme le CA signé) et affichés sur le Dashboard.

### 1. Nouvelle table `monthly_activity_kpis`

```text
monthly_activity_kpis
├── id               uuid PK
├── user_id          uuid NOT NULL → auth.users(id) ON DELETE CASCADE
├── year             integer NOT NULL
├── month            integer NOT NULL (1-12)
├── discovery_calls  integer NOT NULL DEFAULT 0
├── active_clients   integer NOT NULL DEFAULT 0
├── prospects        integer NOT NULL DEFAULT 0
├── created_at       timestamp default now()
├── updated_at       timestamp default now()
└── UNIQUE(user_id, year, month)
```

RLS : authenticated, filtre `user_id = auth.uid()` pour SELECT/INSERT/UPDATE/DELETE.

### 2. Objectifs d'activité dans la page Objectifs

Nouvelle table `quarterly_activity_targets` :

```text
quarterly_activity_targets
├── id               uuid PK
├── user_id          uuid NOT NULL → auth.users(id) ON DELETE CASCADE
├── year             integer NOT NULL
├── quarter          integer NOT NULL (1-4)
├── discovery_calls  integer NOT NULL DEFAULT 0
├── active_clients   integer NOT NULL DEFAULT 0
├── prospects        integer NOT NULL DEFAULT 0
├── created_at       timestamp default now()
└── UNIQUE(user_id, year, quarter)
```

Dans **ObjectifsPage.tsx**, ajouter une section "Objectifs d'activité" sous chaque trimestre :
- 3 champs inline (appels découverte, clientes actives, prospects) par trimestre
- Auto-save au blur, comme les objectifs de CA
- Affichage compact : icône + label + input number

### 3. Section "CA signé" enrichie (ObjectifsPage)

Dans la section CA signé (les 3 cards mensuelles), ajouter sous le total signé :
- 3 petits champs numériques : ☎️ Appels · 👥 Clientes · 🎯 Prospects
- Auto-save au blur → upsert dans `monthly_activity_kpis`
- Affichage de la cible trimestrielle /3 en petit sous chaque champ

### 4. Dashboard — Nouvelles cards KPI activité

Dans **Dashboard.tsx**, ajouter une rangée de 3 petites cards sous les KPI financiers :

```text
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ☎️ Appels     │  │ 👥 Clientes  │  │ 🎯 Prospects │
│     5         │  │     8        │  │     12       │
│ obj: 10/mois  │  │ obj: 10/mois │  │ obj: 15/mois │
│ ████████░░ 50%│  │ ████████░ 80%│  │ ████████░ 80%│
└──────────────┘  └──────────────┘  └──────────────┘
```

- Données du mois en cours (ou de la période sélectionnée)
- Barre de progression vs objectif trimestriel /3
- Agrégation par trimestre ou année selon la période sélectionnée

### 5. Fichiers modifiés

| Fichier | Changement |
|---|---|
| Migration SQL | Création des 2 tables + RLS |
| `src/lib/dashboard-utils.ts` | Fetch des `monthly_activity_kpis` + `quarterly_activity_targets` dans `fetchDashboardData` |
| `src/pages/Dashboard.tsx` | Nouvelle rangée de 3 cards activité |
| `src/pages/ObjectifsPage.tsx` | Champs objectifs activité par trimestre + champs activité réelle par mois dans la section CA signé |
| `src/pages/ParametresPage.tsx` | Ajout suppression des 2 nouvelles tables dans `handleDeleteAllData` |

### Détails techniques

- Les données d'activité sont indépendantes des transactions bancaires (saisie manuelle uniquement)
- Upsert basé sur `(user_id, year, month)` / `(user_id, year, quarter)` pour éviter les doublons
- Les cards activité du dashboard sont masquées si aucune donnée ni objectif n'existe (pas de bruit visuel)

