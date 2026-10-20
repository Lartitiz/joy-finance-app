-- Nettoyage des doublons d'import (T1 2026 surtout)
-- À lancer à la main dans l'éditeur SQL (Lovable > Cloud > SQL, ou Supabase),
-- ÉTAPE PAR ÉTAPE, dans l'ordre : sélectionner le bloc d'une étape, puis « Run ».
-- Ce fichier n'est pas une migration : il n'est jamais exécuté automatiquement.
--
-- Un doublon = même compte, même date, même montant (le signe donne le sens) et
-- même libellé une fois normalisé, exactement comme le nouvel anti-doublon de
-- l'import (src/lib/import-utils.ts, normalizeLabel) : minuscules, sans accents,
-- sans ponctuation, et seulement la partie après le dernier " | ".
--
-- Seuls les groupes où le libellé apparaît sous AU MOINS DEUX FORMES
-- (ex. "VIR SEPA STRIPE" et "Vir Sepa Stripe | VIR SEPA STRIPE") sont nettoyés :
-- c'est la signature d'un double import. Dans un groupe, on garde autant de lignes
-- que la forme la plus nombreuse (deux vrais virements identiques importés deux
-- fois : on en garde deux). La ligne gardée est en priorité celle qui est déjà
-- catégorisée et validée, puis celle au libellé brut (sans " | ").
-- Les groupes à une seule forme ne sont jamais supprimés d'office : l'étape 5
-- les liste pour vérification à la main.


-- ═════ ÉTAPE 1 : SAUVEGARDE + LISTE FIGÉE DES LIGNES À SUPPRIMER ═════
-- Écrit seulement dans un schéma privé « sauvegarde » (non exposé à l'API).
-- Ne touche pas encore aux transactions.
CREATE SCHEMA IF NOT EXISTS sauvegarde;

CREATE TABLE sauvegarde.transactions_20261020 AS
SELECT * FROM public.transactions;

CREATE TABLE sauvegarde.doublons_20261020 AS
WITH norm AS (
  SELECT t.id, t.user_id, t.date, t.amount, t.label, t.category_id,
         t.is_validated, t.created_at,
    trim(regexp_replace(
      translate(lower(regexp_replace(t.label, '^.*\s\|\s', '')),
        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
      '[^a-z0-9]+', ' ', 'g')) AS label_norm
  FROM public.transactions t
), par_forme AS (
  SELECT user_id, date, amount, label_norm, label, count(*) AS nb
  FROM norm GROUP BY user_id, date, amount, label_norm, label
), groupes AS (
  SELECT user_id, date, amount, label_norm,
         count(*) AS nb_formes, max(nb) AS a_garder
  FROM par_forme GROUP BY user_id, date, amount, label_norm
  HAVING count(*) >= 2
), rangs AS (
  SELECT n.*, g.a_garder,
    row_number() OVER (
      PARTITION BY n.user_id, n.date, n.amount, n.label_norm
      ORDER BY (n.category_id IS NOT NULL AND n.is_validated IS TRUE) DESC,
               (n.label LIKE '% | %') ASC, n.created_at, n.id) AS rn
  FROM norm n
  JOIN groupes g USING (user_id, date, amount, label_norm)
)
SELECT id, user_id, date, amount, label, category_id, is_validated, created_at, label_norm
FROM rangs WHERE rn > a_garder;


-- ═════ ÉTAPE 2 : APERÇU (lecture seule) ═════
-- Ce qui sera supprimé, par trimestre et par catégorie. Écarts attendus avec Indy
-- au T1 : ≈ 3 984,50 € de CA, ≈ 1 477 € de dépenses, 2 000 € de rémunération,
-- et rien (ou presque) aux autres trimestres. Si les chiffres sont loin de ça,
-- NE PAS passer à l'étape 3.
SELECT extract(quarter FROM d.date) AS trimestre,
       coalesce(c.type, '(sans catégorie)') AS type,
       coalesce(c.name, '(sans catégorie)') AS categorie,
       count(*) AS lignes,
       sum(d.amount) AS montant
FROM sauvegarde.doublons_20261020 d
LEFT JOIN public.categories c ON c.id = d.category_id
WHERE d.date >= '2026-01-01' AND d.date < '2027-01-01'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- Détail ligne par ligne si besoin :
-- SELECT * FROM sauvegarde.doublons_20261020 ORDER BY date, amount;


-- ═════ ÉTAPE 3 : SUPPRESSION ═════
-- Supprime uniquement les lignes listées à l'étape 1.
DELETE FROM public.transactions
WHERE id IN (SELECT id FROM sauvegarde.doublons_20261020);


-- ═════ ÉTAPE 4 : CONTRÔLE (lecture seule) ═════
-- CA par trimestre, même règle que le tableau de bord (catégorie de type
-- revenu, validée). Attendu (Indy) : T1 7 820 €, T2 11 098 €, T3 10 658 €.
SELECT extract(quarter FROM t.date) AS trimestre,
       sum(t.amount) FILTER (WHERE t.amount > 0 AND c.type = 'revenue' AND t.is_validated) AS ca,
       sum(-t.amount) FILTER (WHERE t.amount < 0 AND coalesce(c.type, '') <> 'remuneration') AS depenses_hors_remuneration,
       sum(-t.amount) FILTER (WHERE t.amount < 0 AND c.type = 'remuneration') AS remuneration
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.date >= '2026-01-01' AND t.date < '2027-01-01'
GROUP BY 1 ORDER BY 1;


-- ═════ ÉTAPE 5 : RESTE À VÉRIFIER À LA MAIN (lecture seule) ═════
-- Groupes identiques sous une seule forme de libellé : soit de vrais mouvements
-- répétés (deux paiements identiques le même jour), soit des doublons passés
-- par l'ancien anti-doublon limité à 1 000 lignes. À regarder un par un.
WITH norm AS (
  SELECT t.*,
    trim(regexp_replace(
      translate(lower(regexp_replace(t.label, '^.*\s\|\s', '')),
        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
      '[^a-z0-9]+', ' ', 'g')) AS label_norm
  FROM public.transactions t
)
SELECT date, amount, label_norm, count(*) AS nb,
       array_agg(created_at ORDER BY created_at) AS crees_le
FROM norm
GROUP BY user_id, date, amount, label_norm
HAVING count(*) > 1
ORDER BY date;


-- ═════ EN CAS DE PROBLÈME : ANNULER L'ÉTAPE 3 ═════
-- Remet les lignes supprimées telles qu'elles étaient.
-- INSERT INTO public.transactions
-- SELECT * FROM sauvegarde.transactions_20261020
-- WHERE id IN (SELECT id FROM sauvegarde.doublons_20261020);


-- ═════ PLUS TARD (une fois les chiffres validés avec Indy) ═════
-- DROP SCHEMA sauvegarde CASCADE;
