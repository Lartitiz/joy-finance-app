import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  type: string;
}

const EMOJI_PRESETS = [
  '🖥️', '🏠', '👩‍💻', '📚', '🚗', '📦', '📱', '🍽️', '🏦', '📋',
  '🤝', '👯', '🎓', '💻', '🎤', '💰', '📊', '🎯', '⚙️', '🔧',
  '✈️', '🎨', '📝', '🛒', '❓',
];

interface CategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { name: string; emoji: string; color: string; type: string }) => void;
  category: Category | null;
  defaultType: 'expense' | 'revenue';
  colorPalette: string[];
}

export function CategoryModal({
  open,
  onOpenChange,
  onSave,
  category,
  defaultType,
  colorPalette,
}: CategoryModalProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState('');
  const [type, setType] = useState<string>('expense');

  useEffect(() => {
    if (open) {
      if (category) {
        setName(category.name);
        setEmoji(category.emoji || '');
        setColor(category.color || colorPalette[0]);
        setType(category.type);
      } else {
        setName('');
        setEmoji('');
        setColor(colorPalette[0]);
        setType(defaultType);
      }
    }
  }, [open, category, defaultType, colorPalette]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), emoji, color, type });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="font-serif font-normal text-accent">
            {category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="cat-name">Nom</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Outils & SaaS"
              required
            />
          </div>

          {/* Emoji selector */}
          <div className="space-y-2">
            <Label>Emoji</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_PRESETS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-colors ${
                    emoji === em ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {colorPalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-md transition-all ${
                    color === c ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: `#${c}` }}
                />
              ))}
            </div>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2">
              {[
                { value: 'expense', label: 'Dépense' },
                { value: 'revenue', label: 'Revenu' },
                { value: 'both', label: 'Les deux' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`px-4 py-2 rounded-full text-sm transition-colors ${
                    type === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {category ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
