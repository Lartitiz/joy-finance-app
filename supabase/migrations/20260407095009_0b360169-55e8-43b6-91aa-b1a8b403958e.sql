
-- Table: monthly_activity_kpis
CREATE TABLE public.monthly_activity_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  discovery_calls integer NOT NULL DEFAULT 0,
  active_clients integer NOT NULL DEFAULT 0,
  prospects integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);

ALTER TABLE public.monthly_activity_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own monthly_activity_kpis" ON public.monthly_activity_kpis FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monthly_activity_kpis" ON public.monthly_activity_kpis FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monthly_activity_kpis" ON public.monthly_activity_kpis FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monthly_activity_kpis" ON public.monthly_activity_kpis FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Table: quarterly_activity_targets
CREATE TABLE public.quarterly_activity_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  quarter integer NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  discovery_calls integer NOT NULL DEFAULT 0,
  active_clients integer NOT NULL DEFAULT 0,
  prospects integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, quarter)
);

ALTER TABLE public.quarterly_activity_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own quarterly_activity_targets" ON public.quarterly_activity_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own quarterly_activity_targets" ON public.quarterly_activity_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own quarterly_activity_targets" ON public.quarterly_activity_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own quarterly_activity_targets" ON public.quarterly_activity_targets FOR DELETE TO authenticated USING (auth.uid() = user_id);
