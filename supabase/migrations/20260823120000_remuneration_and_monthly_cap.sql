-- Sépare la rémunération (ce que tu te reverses) des vraies dépenses pro,
-- et ajoute un plafond mensuel optionnel par catégorie (ex: SaaS à 400 €/mois).

-- 1. Autorise le type 'remuneration' sur categories.type
DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.categories'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%IN%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.categories DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_type_check
  CHECK (type IN ('expense', 'revenue', 'both', 'remuneration'));

-- 2. Plafond mensuel optionnel par catégorie
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS monthly_cap NUMERIC(12,2);
