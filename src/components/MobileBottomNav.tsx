import { BarChart3, Download, Tags, Target, Wallet, Settings } from 'lucide-react';
import { NavLink } from '@/components/NavLink';

const items = [
  { title: 'Accueil', url: '/dashboard', icon: BarChart3 },
  { title: 'Import', url: '/import', icon: Download },
  { title: 'Catégories', url: '/categories', icon: Tags },
  { title: 'Objectifs', url: '/objectifs', icon: Target },
  { title: 'Trésorerie', url: '/tresorerie', icon: Wallet },
  { title: 'Réglages', url: '/parametres', icon: Settings },
];

export function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-1 py-1.5 safe-area-bottom">
      <div className="flex items-center justify-around">
        {items.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === '/dashboard'}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-muted-foreground transition-colors"
            activeClassName="text-primary bg-primary/5"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] leading-tight">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
