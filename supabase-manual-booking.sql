-- ============================================
-- SAISIE MANUELLE D'UNE PRESTATION RÉALISÉE
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Le salon reçoit plus de clientes au comptoir qu'en ligne. Sans un moyen de
-- reporter le cahier dans l'application, le chiffre d'affaires affiché ne
-- reflète qu'une partie de l'activité.
--
-- Cette fonction enregistre une prestation DÉJÀ RÉALISÉE ET RÉGLÉE : elle entre
-- directement en statut « completed » et compte immédiatement dans la
-- comptabilité. Elle ne passe pas par le parcours de réservation.
--
-- Prérequis : supabase-admin-role.sql (fournit is_admin()) et
-- supabase-bookings-user-link.sql (colonnes user_id et price_at_booking).
-- La remise est transmise par l'écran, pas lue dans `promotions` : ce fichier
-- ne dépend donc pas de supabase-promotions.sql.

-- ============================================
-- 1. LA FONCTION
-- ============================================
-- Réservée aux administrateurs : c'est le seul point de l'application qui
-- permet de fixer un montant sans qu'il découle du tarif en vigueur.

CREATE OR REPLACE FUNCTION public.create_manual_booking(
    p_service_id       UUID,
    p_client_name      TEXT,
    p_booking_date     DATE,
    p_start_time       TIME,
    p_discount_percent NUMERIC DEFAULT 0,
    p_client_phone     TEXT DEFAULT NULL,
    p_client_email     TEXT DEFAULT NULL,
    p_notes            TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_duration INTEGER;
    v_price    NUMERIC(10,2);
    v_discount NUMERIC;
    v_end_time TIME;
    v_id       UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur peut enregistrer une prestation.'
            USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(TRIM(p_client_name), '') = '' THEN
        RAISE EXCEPTION 'Le nom de la cliente ou du client est obligatoire.'
            USING ERRCODE = 'P0003';
    END IF;

    -- Une prestation réalisée ne peut pas l'être demain
    IF p_booking_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Une prestation ne peut pas être enregistrée comme réalisée à une date future.'
            USING ERRCODE = 'P0003';
    END IF;

    v_discount := COALESCE(p_discount_percent, 0);

    IF v_discount < 0 OR v_discount >= 100 THEN
        RAISE EXCEPTION 'La remise doit être comprise entre 0 et 99 %%.'
            USING ERRCODE = 'P0003';
    END IF;

    -- Pas de filtre sur `active` : on peut avoir à reporter une prestation qui
    -- a depuis été retirée du site.
    SELECT duration_minutes, price INTO v_duration, v_price
    FROM public.services
    WHERE id = p_service_id;

    IF v_duration IS NULL THEN
        RAISE EXCEPTION 'Prestation introuvable.' USING ERRCODE = 'P0002';
    END IF;

    -- Le montant est celui remisé par l'administratrice, pas la promotion
    -- éventuellement en cours : c'est ce qui a réellement été encaissé qui fait
    -- foi. La promotion du jour ne sert qu'à pré-remplir le formulaire.
    v_price := ROUND(v_price * (100 - v_discount) / 100, 2);

    v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

    -- Aucun contrôle de chevauchement : le cahier fait autorité, et l'index
    -- unique ne couvre de toute façon que les statuts « pending » et
    -- « confirmed ». Une saisie a posteriori ne doit jamais être refusée à
    -- cause d'un créneau bloqué ou d'un jour de fermeture enregistré depuis.
    INSERT INTO public.bookings (
        service_id, client_name, client_phone, client_email,
        booking_date, start_time, end_time, status,
        whatsapp_notification, notes, price_at_booking, user_id,
        expires_at
    ) VALUES (
        p_service_id, TRIM(p_client_name),
        COALESCE(TRIM(p_client_phone), ''), COALESCE(TRIM(p_client_email), ''),
        p_booking_date, p_start_time, v_end_time, 'completed',
        FALSE, p_notes, v_price, NULL,
        NULL
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_booking(UUID, TEXT, DATE, TIME, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(UUID, TEXT, DATE, TIME, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================
-- 2. VÉRIFICATIONS
-- ============================================
-- Les saisies manuelles se reconnaissent à l'absence de compte rattaché et au
-- statut « completed » dès la création :
--   SELECT booking_date, client_name, price_at_booking, created_at
--   FROM public.bookings
--   WHERE user_id IS NULL AND status = 'completed'
--   ORDER BY created_at DESC LIMIT 20;
--
-- Contrôle du chiffre d'affaires du mois, en ligne et au comptoir confondus :
--   SELECT SUM(price_at_booking)
--   FROM public.bookings
--   WHERE status = 'completed'
--     AND booking_date >= DATE_TRUNC('month', CURRENT_DATE);
--
-- Un compte non administrateur qui appelle la fonction reçoit P0001 : la
-- vérification `is_admin()` est faite dans la fonction, le GRANT à
-- `authenticated` ne suffit pas à l'autoriser.
