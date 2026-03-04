
-- 1. categories (must exist before transactions and invoices reference it)
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  type TEXT NOT NULL CHECK (type IN ('expense', 'revenue', 'both')),
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 2. import_batches (must exist before transactions reference it)
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  row_count INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory TEXT,
  source TEXT DEFAULT 'import' CHECK (source IN ('import', 'manual', 'ai_suggested')),
  notes TEXT,
  is_validated BOOLEAN DEFAULT false,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  date_issued DATE NOT NULL,
  date_due DATE,
  status TEXT DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  paid_date DATE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. monthly_objectives
CREATE TABLE public.monthly_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  revenue_target NUMERIC(12,2),
  expense_budget NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- 6. bank_accounts
CREATE TABLE public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  current_balance NUMERIC(12,2) DEFAULT 0,
  last_updated DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============ RLS ============

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- categories
CREATE POLICY "Users can select own categories" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON public.categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON public.categories FOR DELETE USING (auth.uid() = user_id);

-- import_batches
CREATE POLICY "Users can select own import_batches" ON public.import_batches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own import_batches" ON public.import_batches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own import_batches" ON public.import_batches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own import_batches" ON public.import_batches FOR DELETE USING (auth.uid() = user_id);

-- transactions
CREATE POLICY "Users can select own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- invoices
CREATE POLICY "Users can select own invoices" ON public.invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own invoices" ON public.invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own invoices" ON public.invoices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own invoices" ON public.invoices FOR DELETE USING (auth.uid() = user_id);

-- monthly_objectives
CREATE POLICY "Users can select own monthly_objectives" ON public.monthly_objectives FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monthly_objectives" ON public.monthly_objectives FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monthly_objectives" ON public.monthly_objectives FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monthly_objectives" ON public.monthly_objectives FOR DELETE USING (auth.uid() = user_id);

-- bank_accounts
CREATE POLICY "Users can select own bank_accounts" ON public.bank_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bank_accounts" ON public.bank_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bank_accounts" ON public.bank_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bank_accounts" ON public.bank_accounts FOR DELETE USING (auth.uid() = user_id);

-- ============ Updated trigger: create profile + default categories ============

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN NEW;
END;
$$;

-- Recreate trigger (drop if exists to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
