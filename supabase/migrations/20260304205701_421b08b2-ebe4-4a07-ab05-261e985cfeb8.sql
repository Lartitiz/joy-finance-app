
-- 1. Table offers
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  unit_price numeric(12,2) NOT NULL,
  billing_type text NOT NULL CHECK (billing_type IN ('recurring_monthly', 'one_time')),
  recurring_duration integer DEFAULT 6,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own offers" ON public.offers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own offers" ON public.offers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own offers" ON public.offers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own offers" ON public.offers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. Table quarterly_objectives
CREATE TABLE public.quarterly_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  quarter integer NOT NULL CHECK (quarter IN (1, 2, 3, 4)),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  target_new_clients integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, quarter, offer_id)
);

ALTER TABLE public.quarterly_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own quarterly_objectives" ON public.quarterly_objectives FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own quarterly_objectives" ON public.quarterly_objectives FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own quarterly_objectives" ON public.quarterly_objectives FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own quarterly_objectives" ON public.quarterly_objectives FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Table annual_objectives
CREATE TABLE public.annual_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  revenue_target numeric(12,2) NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, year)
);

ALTER TABLE public.annual_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own annual_objectives" ON public.annual_objectives FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own annual_objectives" ON public.annual_objectives FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own annual_objectives" ON public.annual_objectives FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own annual_objectives" ON public.annual_objectives FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4. Update handle_new_user trigger to add default offers
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );

  -- Create default expense categories
  INSERT INTO public.categories (user_id, name, emoji, color, type, is_default, sort_order) VALUES
    (NEW.id, 'Outils & SaaS',              '🖥️', '3498db', 'expense', true, 1),
    (NEW.id, 'Loyer & charges',             '🏠', 'E67E22', 'expense', true, 2),
    (NEW.id, 'Sous-traitance',              '👩‍💻', '9B59B6', 'expense', true, 3),
    (NEW.id, 'Formation',                   '📚', '27AE60', 'expense', true, 4),
    (NEW.id, 'Déplacements',                '🚗', 'F39C12', 'expense', true, 5),
    (NEW.id, 'Matériel & fournitures',      '📦', '1ABC9C', 'expense', true, 6),
    (NEW.id, 'Communication & marketing',   '📱', 'FB3D80', 'expense', true, 7),
    (NEW.id, 'Repas d''affaires',           '🍽️', 'E74C3C', 'expense', true, 8),
    (NEW.id, 'Charges sociales & fiscales', '🏦', '7F8C8D', 'expense', true, 9),
    (NEW.id, 'Assurances',                  '📋', '34495E', 'expense', true, 10),
    (NEW.id, 'Autre dépense',              '❓', '95A5A6', 'expense', true, 11);

  -- Create default revenue categories
  INSERT INTO public.categories (user_id, name, emoji, color, type, is_default, sort_order) VALUES
    (NEW.id, 'Missions agency',                '🤝', 'FB3D80', 'revenue', true, 1),
    (NEW.id, 'Accompagnement binôme',          '👯', 'FFE561', 'revenue', true, 2),
    (NEW.id, 'Formations & cours',             '🎓', '27AE60', 'revenue', true, 3),
    (NEW.id, 'Outil premium (abonnements)',    '💻', '3498db', 'revenue', true, 4),
    (NEW.id, 'Conférences & ateliers',         '🎤', '9B59B6', 'revenue', true, 5),
    (NEW.id, 'Autre revenu',                   '❓', '95A5A6', 'revenue', true, 6);

  -- Create default offers
  INSERT INTO public.offers (user_id, name, emoji, unit_price, billing_type, recurring_duration, sort_order) VALUES
    (NEW.id, 'Ta Binôme',     '👯', 250,  'recurring_monthly', 6, 1),
    (NEW.id, 'Agency',        '🤝', 2000, 'one_time',          NULL, 2),
    (NEW.id, 'Cours école',   '🎓', 2000, 'one_time',          NULL, 3),
    (NEW.id, 'Backup',        '🔄', 600,  'one_time',          NULL, 4),
    (NEW.id, 'L''Assistant',  '💻', 15,   'recurring_monthly', NULL, 5);

  RETURN NEW;
END;
$function$;
