

## Plan : Filtrer le CA cumulé par catégories de type "revenue"

### Problème actuel

`computeKpis` filtre simplement `amount > 0` pour calculer le CA. Cela inclut potentiellement des virements internes, remboursements ou apports personnels qui ne sont pas du vrai chiffre d'affaires déclarable.

### Solution

Modifier `computeKpis` pour accepter la liste des catégories et ne compter comme "revenue" que les transactions dont la `category_id` correspond à une catégorie de type `'revenue'`. Les transactions positives sans catégorie ou avec une catégorie d'un autre type seront exclues du CA.

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/lib/dashboard-utils.ts` | `computeKpis` prend un 3e paramètre `categories: Category[]`, filtre les transactions positives par `category_id` appartenant à une catégorie de type `'revenue'` |
| `src/pages/Dashboard.tsx` | Passer `data.categories` à `computeKpis` |

### Impact

- Le même filtre sera appliqué aux transactions N et N-1, donc la variation reste cohérente
- Les dépenses restent inchangées (`amount < 0`)
- Le résultat net reste `revenue - expense` avec le nouveau revenue filtré
- Le graphique mensuel et le breakdown trimestriel utilisent aussi `amount > 0` — ils seront également mis à jour pour cohérence

### Détail technique

```typescript
// computeKpis modifié
export function computeKpis(transactions: Transaction[], prevTransactions: Transaction[], categories: Category[]) {
  const revCatIds = new Set(categories.filter(c => c.type === 'revenue').map(c => c.id));
  const revenue = transactions
    .filter(t => t.amount > 0 && t.category_id && revCatIds.has(t.category_id))
    .reduce((s, t) => s + t.amount, 0);
  // ... idem pour prevRevenue
}
```

Le même filtre sera propagé dans `buildMonthlyChartData` et `computeQuarterlyBreakdown` pour que le graphique et les breakdowns trimestriels soient cohérents.

