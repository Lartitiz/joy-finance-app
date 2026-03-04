import { CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface ImportSuccessProps {
  count: number;
  onReset: () => void;
}

export function ImportSuccess({ count, onReset }: ImportSuccessProps) {
  return (
    <div className="bg-card rounded-[20px] shadow-soft p-12 flex flex-col items-center gap-4 text-center">
      <CheckCircle className="h-12 w-12 text-green-500" />
      <h2 className="text-xl text-accent">{count} transactions importées</h2>
      <p className="text-muted-foreground">
        Passe à la catégorisation pour organiser tes dépenses et revenus.
      </p>
      <div className="flex gap-3 mt-2">
        <Button asChild>
          <Link to="/categories">Catégorisation →</Link>
        </Button>
        <Button variant="outline" onClick={onReset}>
          Importer un autre fichier
        </Button>
      </div>
    </div>
  );
}
