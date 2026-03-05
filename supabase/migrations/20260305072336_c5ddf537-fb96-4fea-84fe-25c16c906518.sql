-- Table: monthly_signed_revenue
CREATE TABLE public.monthly_signed_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  total_signed numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);

ALTER TABLE public.monthly_signed_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own monthly_signed_revenue" ON public.monthly_signed_revenue FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monthly_signed_revenue" ON public.monthly_signed_revenue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monthly_signed_revenue" ON public.monthly_signed_revenue FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monthly_signed_revenue" ON public.monthly_signed_revenue FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Table: monthly_signed_revenue_details
CREATE TABLE public.monthly_signed_revenue_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_signed_id uuid NOT NULL REFERENCES public.monthly_signed_revenue(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  label text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_signed_revenue_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own monthly_signed_revenue_details" ON public.monthly_signed_revenue_details FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monthly_signed_revenue_details" ON public.monthly_signed_revenue_details FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monthly_signed_revenue_details" ON public.monthly_signed_revenue_details FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monthly_signed_revenue_details" ON public.monthly_signed_revenue_details FOR DELETE TO authenticated USING (auth.uid() = user_id);