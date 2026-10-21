-- Synchronisation hebdomadaire Indy -> app (script local tools/indy-sync).
-- Migration additive : une table « devis » (quotes), une table des clés de
-- synchronisation et une fonction qui ajoute ou met à jour les factures et les
-- devis d'une seule utilisatrice. Rien n'est jamais supprimé.

-- Numéro de facture : déjà ajouté par la migration des factures à encaisser,
-- repris ici pour que l'ordre d'application des deux migrations soit sans effet.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS number TEXT;

-- 1. Devis (même modèle que invoices)
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  title TEXT,
  amount NUMERIC(12,2) NOT NULL,           -- TTC
  date_issued DATE NOT NULL,
  date_expires DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'invoiced', 'refused', 'expired', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own quotes" ON public.quotes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own quotes" ON public.quotes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own quotes" ON public.quotes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own quotes" ON public.quotes FOR DELETE USING (auth.uid() = user_id);

-- 2. Clés de synchronisation. On ne garde que l'empreinte SHA-256 de la clé :
-- la clé elle-même reste dans le trousseau du Mac. RLS active et aucune règle
-- d'accès : la table est illisible depuis l'app et depuis l'API.
CREATE TABLE IF NOT EXISTS public.sync_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.sync_keys ENABLE ROW LEVEL SECURITY;

-- 3. Fonction appelée par le script. La clé ne permet que ceci : ajouter ou
-- mettre à jour des factures et des devis au nom de sa propriétaire.
-- p_dry_run = true : calcule et renvoie ce qui serait écrit, sans rien écrire.
--
-- Factures : reconnues par leur numéro (ou, pour une facture saisie à la main
-- sans numéro, par client + date + montant : on lui ajoute alors son numéro).
-- Mise à jour : statut, date d'échéance, date de paiement. Une facture marquée
-- payée dans l'app n'est jamais repassée en non payée : l'écart est signalé.
-- Devis : reconnus par leur numéro, tous les champs suivent Indy.
CREATE OR REPLACE FUNCTION public.indy_sync(
  p_key TEXT,
  p_invoices JSONB,
  p_quotes JSONB,
  p_dry_run BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_item JSONB;
  v_row public.invoices%ROWTYPE;
  v_q public.quotes%ROWTYPE;
  v_status TEXT;
  v_found BOOLEAN;
  v_inv_new JSONB := '[]';
  v_inv_upd JSONB := '[]';
  v_inv_gaps JSONB := '[]';
  v_q_new JSONB := '[]';
  v_q_upd JSONB := '[]';
  v_inv_same INT := 0;
  v_q_same INT := 0;
BEGIN
  SELECT user_id INTO v_user FROM public.sync_keys
   WHERE key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'cle de synchronisation inconnue' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_invoices) <> 'array' OR jsonb_typeof(p_quotes) <> 'array'
     OR jsonb_array_length(p_invoices) > 2000 OR jsonb_array_length(p_quotes) > 2000 THEN
    RAISE EXCEPTION 'donnees refusees : listes attendues (2000 lignes au plus)';
  END IF;

  -- Factures
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_invoices) LOOP
    IF coalesce(v_item->>'number', '') = '' OR coalesce(v_item->>'client_name', '') = ''
       OR (v_item->>'amount') IS NULL OR (v_item->>'date_issued') IS NULL
       OR v_item->>'status' NOT IN ('sent', 'paid', 'cancelled') THEN
      RAISE EXCEPTION 'facture refusee, champ manquant ou statut inconnu : %', v_item;
    END IF;

    SELECT * INTO v_row FROM public.invoices
     WHERE user_id = v_user AND number = v_item->>'number'
     ORDER BY created_at LIMIT 1;
    v_found := FOUND;
    IF NOT v_found THEN
      SELECT * INTO v_row FROM public.invoices
       WHERE user_id = v_user AND number IS NULL
         AND lower(client_name) = lower(v_item->>'client_name')
         AND date_issued = (v_item->>'date_issued')::date
         AND amount = (v_item->>'amount')::numeric
       ORDER BY created_at LIMIT 1;
      v_found := FOUND;
    END IF;

    IF NOT v_found THEN
      v_inv_new := v_inv_new || jsonb_build_array(v_item);
      IF NOT p_dry_run THEN
        INSERT INTO public.invoices (user_id, number, client_name, description, amount,
                                     date_issued, date_due, status, paid_date)
        VALUES (v_user, v_item->>'number', v_item->>'client_name', v_item->>'description',
                (v_item->>'amount')::numeric, (v_item->>'date_issued')::date,
                (v_item->>'date_due')::date, v_item->>'status', (v_item->>'paid_date')::date);
      END IF;
      CONTINUE;
    END IF;

    v_status := v_item->>'status';
    IF v_row.status = 'paid' AND v_status <> 'paid' THEN
      v_inv_gaps := v_inv_gaps || jsonb_build_array(jsonb_build_object(
        'number', v_item->>'number', 'ecart', 'payee dans l''app, ' || v_status || ' dans Indy'));
      v_status := 'paid';
    END IF;
    IF v_row.amount <> (v_item->>'amount')::numeric THEN
      v_inv_gaps := v_inv_gaps || jsonb_build_array(jsonb_build_object(
        'number', v_item->>'number', 'ecart',
        'montant ' || v_row.amount || ' dans l''app, ' || (v_item->>'amount') || ' dans Indy'));
    END IF;

    IF v_row.number IS DISTINCT FROM v_item->>'number'
       OR v_row.status IS DISTINCT FROM v_status
       OR v_row.date_due IS DISTINCT FROM (v_item->>'date_due')::date
       OR (v_item->>'paid_date' IS NOT NULL AND v_row.paid_date IS DISTINCT FROM (v_item->>'paid_date')::date) THEN
      v_inv_upd := v_inv_upd || jsonb_build_array(jsonb_build_object(
        'number', v_item->>'number',
        'avant', jsonb_build_object('number', v_row.number, 'status', v_row.status,
                                    'date_due', v_row.date_due, 'paid_date', v_row.paid_date),
        'apres', jsonb_build_object('status', v_status, 'date_due', v_item->>'date_due',
                                    'paid_date', coalesce(v_item->>'paid_date', v_row.paid_date::text))));
      IF NOT p_dry_run THEN
        UPDATE public.invoices
           SET number = v_item->>'number',
               status = v_status,
               date_due = (v_item->>'date_due')::date,
               paid_date = coalesce((v_item->>'paid_date')::date, paid_date)
         WHERE id = v_row.id;
      END IF;
    ELSE
      v_inv_same := v_inv_same + 1;
    END IF;
  END LOOP;

  -- Devis
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_quotes) LOOP
    IF coalesce(v_item->>'number', '') = '' OR coalesce(v_item->>'client_name', '') = ''
       OR (v_item->>'amount') IS NULL OR (v_item->>'date_issued') IS NULL
       OR v_item->>'status' NOT IN ('pending', 'signed', 'invoiced', 'refused', 'expired', 'cancelled') THEN
      RAISE EXCEPTION 'devis refuse, champ manquant ou statut inconnu : %', v_item;
    END IF;

    SELECT * INTO v_q FROM public.quotes WHERE user_id = v_user AND number = v_item->>'number';
    IF NOT FOUND THEN
      v_q_new := v_q_new || jsonb_build_array(v_item);
      IF NOT p_dry_run THEN
        INSERT INTO public.quotes (user_id, number, client_name, title, amount,
                                   date_issued, date_expires, status, source)
        VALUES (v_user, v_item->>'number', v_item->>'client_name', v_item->>'title',
                (v_item->>'amount')::numeric, (v_item->>'date_issued')::date,
                (v_item->>'date_expires')::date, v_item->>'status', 'indy');
      END IF;
    ELSIF v_q.status IS DISTINCT FROM v_item->>'status'
       OR v_q.amount <> (v_item->>'amount')::numeric
       OR v_q.client_name IS DISTINCT FROM v_item->>'client_name'
       OR v_q.title IS DISTINCT FROM v_item->>'title'
       OR v_q.date_issued IS DISTINCT FROM (v_item->>'date_issued')::date
       OR v_q.date_expires IS DISTINCT FROM (v_item->>'date_expires')::date THEN
      v_q_upd := v_q_upd || jsonb_build_array(jsonb_build_object(
        'number', v_item->>'number', 'avant', v_q.status, 'apres', v_item->>'status'));
      IF NOT p_dry_run THEN
        UPDATE public.quotes
           SET client_name = v_item->>'client_name', title = v_item->>'title',
               amount = (v_item->>'amount')::numeric,
               date_issued = (v_item->>'date_issued')::date,
               date_expires = (v_item->>'date_expires')::date,
               status = v_item->>'status', source = 'indy', updated_at = now()
         WHERE id = v_q.id;
      END IF;
    ELSE
      v_q_same := v_q_same + 1;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.sync_keys SET last_used_at = now()
     WHERE key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'factures', jsonb_build_object('nouvelles', v_inv_new, 'mises_a_jour', v_inv_upd,
                                   'inchangees', v_inv_same, 'ecarts', v_inv_gaps),
    'devis', jsonb_build_object('nouveaux', v_q_new, 'mis_a_jour', v_q_upd,
                                'inchanges', v_q_same));
END;
$$;

REVOKE ALL ON FUNCTION public.indy_sync(TEXT, JSONB, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.indy_sync(TEXT, JSONB, JSONB, BOOLEAN) TO anon, authenticated;
