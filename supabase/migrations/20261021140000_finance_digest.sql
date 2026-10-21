-- Bilan mensuel envoyé à Laetitia (tools/indy-sync, npm run bilan) : qui
-- relancer, quels devis trancher. Lecture seule, avec la même clé que la
-- synchronisation Indy. Migration additive et rejouable sans erreur.
--
-- Renvoie, pour la propriétaire de la clé : les factures non payées, les dates
-- de relance par client, les devis en attente, expirés ou signés, et la date de
-- la dernière synchronisation. N'écrit rien.
CREATE OR REPLACE FUNCTION public.finance_digest(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_last_sync TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT user_id, last_used_at INTO v_user, v_last_sync FROM public.sync_keys
   WHERE key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'cle de synchronisation inconnue' USING ERRCODE = '28000';
  END IF;

  RETURN jsonb_build_object(
    'derniere_synchro', v_last_sync,
    'factures', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'number', number, 'client_name', client_name, 'amount', amount,
        'date_issued', date_issued, 'date_due', date_due, 'status', status, 'paid_date', paid_date)
        ORDER BY date_issued)
        FROM public.invoices
       WHERE user_id = v_user AND status IN ('sent', 'overdue')), '[]'::jsonb),
    'relances', coalesce((
      SELECT jsonb_agg(jsonb_build_object('client_name', client_name, 'reminded_at', reminded_at))
        FROM public.client_reminders
       WHERE user_id = v_user), '[]'::jsonb),
    'devis', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'number', number, 'client_name', client_name, 'title', title, 'amount', amount,
        'date_issued', date_issued, 'date_expires', date_expires, 'status', status)
        ORDER BY date_issued)
        FROM public.quotes
       WHERE user_id = v_user AND status IN ('pending', 'expired', 'signed')), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finance_digest(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_digest(TEXT) TO anon, authenticated;
