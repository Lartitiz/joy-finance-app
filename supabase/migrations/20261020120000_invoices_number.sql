-- Numéro de facture (ex. F202610-32), pour la liste « À encaisser » et pour
-- reconnaître une facture déjà importée. Migration additive : RLS déjà active
-- sur invoices (une utilisatrice ne voit que ses factures).
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS number TEXT;
