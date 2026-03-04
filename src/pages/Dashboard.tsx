import { TrendingUp, TrendingDown, Wallet, Target } from 'lucide-react';

const kpis = [
  { label: 'Revenus du mois', value: '12 450 €', change: '+8.2%', up: true, icon: TrendingUp },
  { label: 'Dépenses du mois', value: '7 830 €', change: '+3.1%', up: false, icon: TrendingDown },
  { label: 'Solde actuel', value: '24 620 €', change: '+12.4%', up: true, icon: Wallet },
  { label: 'vs Objectif', value: '87%', change: '+5%', up: true, icon: Target },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl text-accent">Tableau de bord</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-card rounded-[20px] shadow-soft p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{kpi.label}</span>
              <kpi.icon className="h-5 w-5 text-primary" />
            </div>
            <p className="text-3xl font-mono">{kpi.value}</p>
            <span
              className={`text-xs font-mono ${
                kpi.up ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {kpi.change} vs mois précédent
            </span>
          </div>
        ))}
      </div>

      {/* Placeholder graph */}
      <div className="bg-card rounded-[20px] shadow-soft p-8 flex items-center justify-center min-h-[240px]">
        <p className="text-muted-foreground font-serif">Graphique revenus / dépenses</p>
      </div>

      {/* Placeholder transactions */}
      <div className="bg-card rounded-[20px] shadow-soft p-8 flex items-center justify-center min-h-[180px]">
        <p className="text-muted-foreground font-serif">Dernières transactions</p>
      </div>
    </div>
  );
}
