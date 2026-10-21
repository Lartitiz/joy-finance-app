-- Relances clients : date de la dernière relance, par client. Aide-mémoire
-- seulement, rien n'est envoyé. Table à part : la synchronisation Indy du lundi
-- (fonction indy_sync) ne la touche jamais, la date n'est donc pas effacée.
-- Migration additive et rejouable sans erreur.
CREATE TABLE IF NOT EXISTS public.client_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  reminded_at DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_name)
);

ALTER TABLE public.client_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own client reminders" ON public.client_reminders;
CREATE POLICY "Users can select own client reminders" ON public.client_reminders FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own client reminders" ON public.client_reminders;
CREATE POLICY "Users can insert own client reminders" ON public.client_reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own client reminders" ON public.client_reminders;
CREATE POLICY "Users can update own client reminders" ON public.client_reminders FOR UPDATE USING (auth.uid() = user_id);
