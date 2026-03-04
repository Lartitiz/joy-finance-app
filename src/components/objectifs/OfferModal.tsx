import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMOJI_OPTIONS = [
  '👯', '🤝', '🎓', '🔄', '💻', '📦', '🎤', '🖥️', '📱', '📚',
  '🚗', '🏠', '🍽️', '🏦', '📋', '💰', '🎯', '⭐', '🔥', '💎',
  '🌟', '🛠️', '✨', '🧠', '🎨', '📝', '🤖', '📊', '💡', '🏆',
];

interface Offer {
  id: string;
  name: string;
  emoji: string | null;
  unit_price: number;
  billing_type: 'recurring_monthly' | 'one_time';
  recurring_duration: number | null;
}

interface OfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    name: string;
    emoji: string;
    unit_price: number;
    billing_type: 'recurring_monthly' | 'one_time';
    recurring_duration: number | null;
  }) => void;
  offer: Offer | null;
}

export function OfferModal({ open, onOpenChange, onSave, offer }: OfferModalProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📦');
  const [unitPrice, setUnitPrice] = useState('');
  const [billingType, setBillingType] = useState<'recurring_monthly' | 'one_time'>('one_time');
  const [duration, setDuration] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (open) {
      if (offer) {
        setName(offer.name);
        setEmoji(offer.emoji ?? '📦');
        setUnitPrice(offer.unit_price.toString());
        setBillingType(offer.billing_type);
        setDuration(offer.recurring_duration?.toString() ?? '');
      } else {
        setName('');
        setEmoji('📦');
        setUnitPrice('');
        setBillingType('one_time');
        setDuration('');
      }
      setShowEmojiPicker(false);
    }
  }, [open, offer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unitPrice) return;
    onSave({
      name: name.trim(),
      emoji,
      unit_price: parseFloat(unitPrice),
      billing_type: billingType,
      recurring_duration: billingType === 'recurring_monthly' && duration ? parseInt(duration) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="font-serif font-normal text-accent">
            {offer ? 'Modifier l\'offre' : 'Nouvelle offre'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name + Emoji */}
          <div className="space-y-1.5">
            <Label>Nom de l'offre</Label>
            <div className="flex gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="h-10 w-12 rounded-lg border border-border bg-background flex items-center justify-center text-lg hover:bg-muted transition-colors"
                >
                  {emoji}
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-50 bg-card border border-border rounded-xl shadow-lg p-2 grid grid-cols-6 gap-1 w-[220px]">
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                        className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-lg transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex: Ta Binôme, Agency…"
                className="flex-1"
              />
            </div>
          </div>

          {/* Unit price */}
          <div className="space-y-1.5">
            <Label>Prix unitaire</Label>
            <div className="relative">
              <Input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                required
                min={0}
                step={0.01}
                className="font-mono pr-8"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
            </div>
          </div>

          {/* Billing type toggle */}
          <div className="space-y-1.5">
            <Label>Type de facturation</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBillingType('recurring_monthly')}
                className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-colors ${
                  billingType === 'recurring_monthly'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                Récurrent mensuel
              </button>
              <button
                type="button"
                onClick={() => setBillingType('one_time')}
                className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-colors ${
                  billingType === 'one_time'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                Ponctuel
              </button>
            </div>
          </div>

          {/* Duration (only for recurring) */}
          {billingType === 'recurring_monthly' && (
            <div className="space-y-1.5">
              <Label>Durée d'engagement</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min={1}
                  className="font-mono pr-14"
                  placeholder="Laisser vide = illimité"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">mois</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit">{offer ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
