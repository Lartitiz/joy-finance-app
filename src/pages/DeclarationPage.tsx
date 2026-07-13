import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { ChevronLeft, ChevronRight, Copy, AlertTriangle, PiggyBank, Receipt, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fetchDeclarationData, formatEur, type Transaction, type Category } from '@/lib/dashboard-utils';
import {
  REGIMES, defaultSettings, loadSettings, saveSettings,
  quarterRevenueRaw, quarterUncategorized, yearRevenueRaw,
  estimateCotisations, thresholdStatus,
  type DeclarationSettings,
} from '@/lib/declaration-utils';

const Q_LABELS = ['Jan — Mar', 'Avr — Jun', 'Jul — Sep', 'Oct — Déc'];

export default function DeclarationPage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [allYearTransactions, setAllYearTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<DeclarationSettings>(defaultSettings());

  useEffect(() => { if (user) setSettings(loadSettings(user.id)); }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const d = await fetchDeclarationData(user.id, year);
    setAllYearTransactions(d.allYearTransactions);
    setCategories(d.categories);
    setLoading(false);
  }, [user, year]);

  useEffect(() => { load(); }, [load]);

  const updateSettings = (patch: Partial<DeclarationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      if (user) saveSettings(user.id, next);
      return next;
    });
  };

  const onRegimeChange = (regimeId: string) => {
    const r = REGIMES.find(r => r.id === regimeId);
    if (r) updateSettings({ regimeId, socialRate: r.socialRate, liberatoireRate: r.liberatoireRate, plafond: r.plafond });
  };

  const caRaw = quarterRevenueRaw(allYearTransactions, categories, quarter);
  const est = estimateCotisations(caRaw, settings);
  const uncat = quarterUncategorized(allYearTransactions, quarter);
  const threshold = thresholdStatus(yearRevenueRaw(allYearTransactions, categories), settings.plafond);

  const copyCA = async () => {
    try {
      await navigator.clipboard.writeText(String(est.caDeclared));
      toast.success(`${est.caDeclared} € copié — colle-le dans ta déclaration`);
    } catch {
      toast.error('Copie impossible sur cet appareil');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl text-accent">Déclaration</h1>
          <p className="text-sm text-muted-foreground">Le chiffre d'affaires encaissé à déclarer, trimestre par trimestre.</p>
        </div>
        <div className="flex items-center gap-2 bg-card rounded-full shadow-soft px-1 py-1 self-start">
          <button onClick={() => setYear(year - 1)} className="p-2 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">{year}</span>
          <button onClick={() => setYear(year + 1)} className="p-2 rounded-full hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quarter selector */}
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map(q => (
          <button key={q} onClick={() => setQuarter(q)}
            className={`rounded-2xl border-2 p-3 text-center transition-colors ${quarter === q ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'}`}>
            <div className="text-sm font-medium text-accent">T{q}</div>
            <div className="text-[11px] text-muted-foreground">{Q_LABELS[q - 1]}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-card rounded-[20px] shadow-soft h-[180px] animate-pulse" />
      ) : (
        <>
          {/* CA à déclarer */}
          <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">CA à déclarer · T{quarter} {year}</span>
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <p className="text-4xl lg:text-5xl font-mono text-accent">{est.caDeclared.toLocaleString('fr-FR')} €</p>
              <button onClick={copyCA}
                className="flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm hover:opacity-90 transition-opacity">
                <Copy className="h-4 w-4" /> Copier le montant
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Montant encaissé du trimestre, arrondi à l'euro (comme le demande l'URSSAF). Total exact : {formatEur(caRaw)}.
            </p>
          </div>

          {/* Alerte non catégorisé */}
          {uncat.count > 0 && (
            <Link to="/categories"
              className="flex items-start gap-3 bg-yellow-50 border-2 border-secondary rounded-[20px] p-4 hover:shadow-md transition-shadow">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-accent">
                  {uncat.count} rentrée{uncat.count > 1 ? 's' : ''} d'argent non classée{uncat.count > 1 ? 's' : ''} ce trimestre{' '}
                  <span className="font-mono">({formatEur(uncat.total)})</span>
                </p>
                <p className="text-muted-foreground">Non comptée{uncat.count > 1 ? 's' : ''} dans le CA ci-dessus. Classe-les avant de déclarer. →</p>
              </div>
            </Link>
          )}

          {/* Cotisations estimées */}
          <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg text-accent">À mettre de côté pour ce trimestre</h2>
              <PiggyBank className="h-5 w-5 text-primary" />
            </div>
            <p className="text-3xl font-mono text-accent">{est.total.toLocaleString('fr-FR')} €</p>
            <div className="space-y-1.5 text-sm">
              <Line label={`Cotisations sociales (${settings.socialRate} %)`} value={est.social} />
              {settings.liberatoireEnabled && (
                <Line label={`Impôt — versement libératoire (${settings.liberatoireRate} %)`} value={est.liberatoire} />
              )}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Estimation basée sur les taux réglés plus bas. Vérifie toujours le montant officiel affiché par l'URSSAF.
            </p>
          </div>

          {/* Seuil micro */}
          <div className="bg-card rounded-[20px] shadow-soft p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg text-accent">Seuil micro-entreprise {year}</h2>
              <span className={`text-sm font-mono ${threshold.over ? 'text-destructive' : threshold.warn ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                {Math.round(threshold.pct)} %
              </span>
            </div>
            <Progress value={Math.min(100, threshold.pct)}
              className={`h-3 ${threshold.over ? '[&>div]:bg-destructive' : threshold.warn ? '[&>div]:bg-yellow-500' : '[&>div]:bg-primary'}`} />
            <div className="flex justify-between text-xs font-mono text-muted-foreground">
              <span>{threshold.yearRevenue.toLocaleString('fr-FR')} € cumulés</span>
              <span>plafond {threshold.plafond.toLocaleString('fr-FR')} €</span>
            </div>
            {threshold.over ? (
              <p className="text-xs text-destructive">Plafond dépassé de {formatEur(-threshold.remaining)}. Renseigne-toi sur ta situation (TVA, sortie du régime micro).</p>
            ) : threshold.warn ? (
              <p className="text-xs text-yellow-700">Il te reste {formatEur(threshold.remaining)} avant le plafond. À surveiller.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Il te reste {formatEur(threshold.remaining)} de marge cette année.</p>
            )}
          </div>

          {/* Réglages */}
          <details className="bg-card rounded-[20px] shadow-soft p-6 group">
            <summary className="cursor-pointer text-lg text-accent list-none flex items-center justify-between">
              <span>Mes taux et mon régime</span>
              <ChevronRight className="h-5 w-5 transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-5 space-y-5">
              <div className="space-y-2">
                <Label>Type d'activité (pré-remplit les taux)</Label>
                <Select value={settings.regimeId} onValueChange={onRegimeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIMES.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Taux de cotisations sociales (%)</Label>
                  <Input type="number" step="0.1" min="0" value={settings.socialRate}
                    onChange={e => updateSettings({ socialRate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Plafond annuel du régime (€)</Label>
                  <Input type="number" step="100" min="0" value={settings.plafond}
                    onChange={e => updateSettings({ plafond: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
                <div>
                  <Label className="cursor-pointer">Versement libératoire de l'impôt</Label>
                  <p className="text-xs text-muted-foreground">Active-le si tu paies ton impôt en même temps que tes cotisations.</p>
                </div>
                <Switch checked={settings.liberatoireEnabled}
                  onCheckedChange={v => updateSettings({ liberatoireEnabled: v })} />
              </div>

              {settings.liberatoireEnabled && (
                <div className="space-y-2">
                  <Label>Taux du versement libératoire (%)</Label>
                  <Input type="number" step="0.1" min="0" value={settings.liberatoireRate}
                    onChange={e => updateSettings({ liberatoireRate: parseFloat(e.target.value) || 0 })} />
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Les taux et plafonds proposés sont indicatifs. Ajuste-les à ta situation exacte (URSSAF, ACRE, CFP…). Tes réglages sont enregistrés sur cet appareil.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-accent">{value.toLocaleString('fr-FR')} €</span>
    </div>
  );
}
