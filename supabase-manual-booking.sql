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
-- ⚠ ORDRE : ce fichier alimente désormais `booking_services`, il doit donc
-- être joué APRÈS supabase-multi-service-booking.sql. Si vous l'aviez exécuté
-- plus tôt, rejouez-le maintenant.
--
-- Prérequis : supabase-admin-role.sql (fournit is_admin()),
-- supabase-bookings-user-link.sql (colonnes user_id et price_at_booking) et
-- supabase-multi-service-booking.sql (table booking_services).
-- La remise est transmise par l'écran, pas lue dans `promotions` : ce fichier
-- ne dépend pas de supabase-promotions.sql.

-- ============================================
-- 1. LA FONCTION
-- ============================================
-- Réservée aux administrateurs : c'est le seul point de l'application qui
-- permet de fixer un montant sans qu'il découle du tarif en vigueur.

-- ⚠ Changer un paramètre ne remplace pas la fonction, cela la SURCHARGE : les
-- versions coexisteraient et PostgREST choisirait l'une ou l'autre. On retire
-- donc explicitement les signatures précédentes.
DROP FUNCTION IF EXISTS public.create_manual_booking(UUID, TEXT, DATE, TIME, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_manual_booking(UUID, TEXT, DATE, TIME, NUMERIC, TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.create_manual_booking(
    -- Une ou plusieurs prestations, comme sur le site
    p_service_ids      UUID[],
    p_client_name      TEXT,
    p_booking_date     DATE,
    p_start_time       TIME,
    p_discount_percent NUMERIC DEFAULT 0,
    p_client_phone     TEXT DEFAULT NULL,
    p_client_email     TEXT DEFAULT NULL,
    p_notes            TEXT DEFAULT NULL,
    -- Montant réellement encaissé. NULL : on retombe sur le tarif remisé.
    p_amount           NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_duration    INTEGER;
    v_price       NUMERIC(10,2);
    v_tarif_total NUMERIC(10,2);
    v_discount    NUMERIC;
    v_main        UUID;
    v_end_time    TIME;
    v_id          UUID;
    v_ecart       NUMERIC(10,2);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur peut enregistrer une prestation.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Choisissez au moins une prestation.' USING ERRCODE = 'P0002';
    END IF;

    -- Même règle que sur le site : une prestation ne figure qu'une fois
    IF array_length(p_service_ids, 1)
       <> (SELECT COUNT(DISTINCT x) FROM UNNEST(p_service_ids) AS x) THEN
        RAISE EXCEPTION 'Une même prestation ne peut être ajoutée qu''une fois.'
            USING ERRCODE = 'P0003';
    END IF;

    IF COALESCE(TRIM(p_client_name), '') = '' THEN
        RAISE EXCEPTION 'Le nom de la cliente ou du client est obligatoire.'
            USING ERRCODE = 'P0003';
    END IF;

    -- Le téléphone est la clé de rapprochement des visites d'une même
    -- personne. Sans lui, la prestation entre bien dans le chiffre d'affaires
    -- mais reste absente du classement des clientes fidèles : rien ne permet
    -- de la rattacher à quelqu'un.
    IF LENGTH(REGEXP_REPLACE(COALESCE(p_client_phone, ''), '\D', '', 'g')) < 6 THEN
        RAISE EXCEPTION 'Le téléphone est obligatoire pour rattacher la prestation à une cliente.'
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
    SELECT SUM(s.duration_minutes), SUM(s.price)
    INTO v_duration, v_tarif_total
    FROM UNNEST(p_service_ids) AS sid
    JOIN public.services s ON s.id = sid;

    IF v_duration IS NULL THEN
        RAISE EXCEPTION 'Prestation introuvable.' USING ERRCODE = 'P0002';
    END IF;

    -- La plus longue nomme le rendez-vous, comme pour une réservation en ligne
    SELECT s.id INTO v_main
    FROM UNNEST(p_service_ids) AS sid
    JOIN public.services s ON s.id = sid
    ORDER BY s.duration_minutes DESC, s.name
    LIMIT 1;

    v_price := v_tarif_total;

    -- Les tarifs affichés sont des prix de DÉPART : un ajout demandé sur place
    -- (motifs, fantaisies, longueur) fait monter la note. Le montant saisi par
    -- l'administratrice l'emporte donc sur tout calcul — c'est ce qui a
    -- réellement été encaissé qui fait foi. À défaut, on retombe sur le tarif
    -- de la prestation, remise déduite.
    IF p_amount IS NOT NULL THEN
        IF p_amount < 0 THEN
            RAISE EXCEPTION 'Le montant encaissé ne peut pas être négatif.'
                USING ERRCODE = 'P0003';
        END IF;
        v_price := ROUND(p_amount, 2);
    ELSE
        v_price := ROUND(v_price * (100 - v_discount) / 100, 2);
    END IF;

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
        v_main, TRIM(p_client_name),
        COALESCE(TRIM(p_client_phone), ''), COALESCE(TRIM(p_client_email), ''),
        p_booking_date, p_start_time, v_end_time, 'completed',
        FALSE, p_notes, v_price, NULL,
        NULL
    )
    RETURNING id INTO v_id;

    -- Le détail des prestations, comme pour une réservation en ligne : sans
    -- lui, une saisie au comptoir échapperait au classement par prestation.
    --
    -- Le montant encaissé est unique, alors que les lignes en veulent chacune
    -- une part : on la répartit au prorata des tarifs. C'est la seule
    -- répartition défendable quand l'ajout demandé sur place n'est pas
    -- rattaché à une prestation en particulier.
    INSERT INTO public.booking_services
        (booking_id, service_id, price_at_booking, duration_minutes, position)
    SELECT v_id, s.id,
           CASE WHEN COALESCE(v_tarif_total, 0) > 0
                THEN ROUND(v_price * s.price / v_tarif_total, 2)
                ELSE 0 END,
           s.duration_minutes,
           t.ord - 1
    FROM UNNEST(p_service_ids) WITH ORDINALITY AS t(sid, ord)
    JOIN public.services s ON s.id = t.sid;

    -- Les arrondis font perdre ou gagner quelques centimes : l'écart est
    -- reporté sur la dernière ligne, pour que la somme vaille exactement le
    -- montant encaissé — c'est l'invariant que vérifie la section 3.
    SELECT v_price - COALESCE(SUM(price_at_booking), 0) INTO v_ecart
    FROM public.booking_services WHERE booking_id = v_id;

    IF v_ecart <> 0 THEN
        UPDATE public.booking_services
        SET price_at_booking = COALESCE(price_at_booking, 0) + v_ecart
        WHERE id = (
            SELECT id FROM public.booking_services
            WHERE booking_id = v_id ORDER BY position DESC LIMIT 1
        );
    END IF;

    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_booking(UUID[], TEXT, DATE, TIME, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_booking(UUID[], TEXT, DATE, TIME, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;

-- ============================================
-- 2. RATTRAPAGE DES SAISIES SANS TÉLÉPHONE
-- ============================================
-- Le téléphone n'a pas toujours été exigé. Les prestations saisies sans lui
-- comptent dans le chiffre d'affaires, mais restent absentes du classement
-- des clientes fidèles : rien ne permet de les rattacher à quelqu'un.
--
-- Les repérer :
--   SELECT id, booking_date, client_name, price_at_booking
--   FROM public.bookings
--   WHERE status = 'completed'
--     AND COALESCE(TRIM(client_phone), '') = ''
--     AND COALESCE(TRIM(client_email), '') = ''
--   ORDER BY booking_date DESC;
--
-- Les corriger, une par une, avec le numéro retrouvé dans le cahier :
--   UPDATE public.bookings SET client_phone = '+242 06 000 00 00'
--   WHERE id = '...';

-- ============================================
-- 3. VÉRIFICATIONS
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
