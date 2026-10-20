-- Sépare la rémunération (ce que tu te reverses) des vraies dépenses pro,
-- et ajoute un plafond mensuel optionnel par catégorie (ex: SaaS à 400 €/mois).

-- 1. Autorise le type 'remuneration' sur categories.type
-- (drop idempotent par nom exact : la contrainte en ligne est stockée sous la
-- forme "type = ANY (ARRAY[...])", non détectée par le motif 'type%IN%' du fichier.)
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_type_check;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_type_check
  CHECK (type IN ('expense', 'revenue', 'both', 'remuneration'));

-- 2. Plafond mensuel optionnel par catégorie
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS monthly_cap NUMERIC(12,2);