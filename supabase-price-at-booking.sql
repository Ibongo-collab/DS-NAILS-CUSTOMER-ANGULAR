-- ============================================
-- FIGER LE PRIX AU MOMENT DE LA RÉSERVATION
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Jusqu'ici le chiffre d'affaires était calculé au tarif *actuel* de chaque
-- prestation : changer le prix des Braids réécrivait tout l'historique.
--
-- On stocke désormais le montant sur la réservation elle-même. Une fois la
-- réservation créée, son prix ne bouge plus.
--
-- Prérequis : supabase-secure-bookings.sql (fournit public.create_booking).
--
-- ⚠ NE PLUS EXÉCUTER CE FICHIER SI supabase-bookings-user-link.sql L'A ÉTÉ.
-- La version de `create_booking` définie en section 3 ci-dessous est
-- antérieure : elle ignore la colonne `user_id`, et la rejouer casserait le
-- rattachement des réservations aux comptes clients.
-- Ce fichier n'a plus d'utilité propre : supabase-bookings-user-link.sql crée
-- désormais lui-même la colonne `price_at_booking` et fait la reprise.
-- Il est conservé pour mémoire de la migration d'origine.

-- ============================================
-- 1. COLONNE
-- ============================================

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS price_at_booking NUMERIC(10,2);

COMMENT ON COLUMN public.bookings.price_at_booking IS
    'Tarif de la prestation au moment de la réservation. Figé : ne pas recalculer.';

-- ============================================
-- 2. REPRISE DE L'EXISTANT
-- ============================================
-- Les réservations déjà en base n'ont pas gardé trace du tarif appliqué : on
-- les initialise au prix actuel de leur prestation. C'est exactement
-- l'approximation qui avait cours jusqu'ici — la différence est qu'elle est
-- désormais figée, et ne dérivera plus aux prochains changements de tarif.
--
-- Si tu sais que certains tarifs ont changé, corrige ces lignes à la main
-- AVANT de continuer à encaisser :
--   UPDATE public.bookings SET price_at_booking = 5000
--   WHERE booking_date < '2026-01-01' AND service_id = '<uuid>';

UPDATE public.bookings b
SET price_at_booking = s.price
FROM public.services s
WHERE b.service_id = s.id
  AND b.price_at_booking IS NULL;

-- ============================================
-- 3. CAPTURE À LA CRÉATION
-- ============================================
-- Même signature qu'avant : seules la lecture du prix et l'insertion changent.

CREATE OR REPLACE FUNCTION public.create_booking(
    p_service_id            UUID,
    p_client_name           TEXT,
    p_client_phone          TEXT,
    p_client_email          TEXT,
    p_booking_date          DATE,
    p_start_time            TIME,
    p_whatsapp_notification BOOLEAN DEFAULT FALSE,
    p_notes                 TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_duration INTEGER;
    v_price    NUMERIC(10,2);
    v_end_time TIME;
    v_message  TEXT;
    v_id       UUID;
BEGIN
    SELECT duration_minutes, price INTO v_duration, v_price
    FROM public.services
    WHERE id = p_service_id AND active = TRUE;

    IF v_duration IS NULL THEN
        RAISE EXCEPTION 'Prestation introuvable ou indisponible.'
            USING ERRCODE = 'P0002';
    END IF;

    v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

    -- Doublon côté cliente. On reproduit la règle du front à l'identique :
    -- une cliente connectée est identifiée par son email, une invitée par son
    -- téléphone.
    IF auth.uid() IS NOT NULL AND p_client_email IS NOT NULL THEN
        v_message := public.has_active_booking(p_client_email, NULL, p_booking_date);
    ELSE
        v_message := public.has_active_booking(NULL, p_client_phone, p_booking_date);
    END IF;

    IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'P0003';
    END IF;

    -- Le salon est-il ouvert ce jour-là ?
    IF EXISTS (
        SELECT 1 FROM public.opening_hours
        WHERE day_of_week = EXTRACT(ISODOW FROM p_booking_date)
          AND is_closed = TRUE
    ) THEN
        RAISE EXCEPTION 'Le salon est fermé à cette date.' USING ERRCODE = 'P0003';
    END IF;

    -- Chevauchement avec une réservation existante
    IF EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.booking_date = p_booking_date
          AND b.status IN ('pending', 'confirmed')
          AND b.start_time < v_end_time
          AND b.end_time > p_start_time
    ) THEN
        RAISE EXCEPTION 'Ce créneau vient d''être réservé par quelqu''un d''autre.'
            USING ERRCODE = 'P0004';
    END IF;

    -- Chevauchement avec une indisponibilité
    IF EXISTS (
        SELECT 1 FROM public.blocked_slots s
        WHERE s.date = p_booking_date
          AND s.start_time < v_end_time
          AND s.end_time > p_start_time
    ) THEN
        RAISE EXCEPTION 'Ce créneau n''est pas disponible.' USING ERRCODE = 'P0004';
    END IF;

    INSERT INTO public.bookings (
        service_id, client_name, client_phone, client_email,
        booking_date, start_time, end_time, status,
        whatsapp_notification, notes, price_at_booking
    ) VALUES (
        p_service_id, p_client_name, p_client_phone, p_client_email,
        p_booking_date, p_start_time, v_end_time, 'pending',
        COALESCE(p_whatsapp_notification, FALSE), p_notes, v_price
    )
    RETURNING id INTO v_id;

    RETURN v_id;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Ce créneau vient d''être réservé par quelqu''un d''autre.'
            USING ERRCODE = 'P0004';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================
-- 4. VÉRIFICATIONS
-- ============================================
-- Aucune réservation ne doit rester sans montant :
--   SELECT COUNT(*) FROM public.bookings WHERE price_at_booking IS NULL;
--
-- Comparer le figé et le tarif courant (les écarts sont normaux après un
-- changement de prix — c'est précisément ce qu'on voulait conserver) :
--   SELECT b.booking_date, s.name, b.price_at_booking, s.price AS tarif_actuel
--   FROM public.bookings b JOIN public.services s ON s.id = b.service_id
--   WHERE b.price_at_booking IS DISTINCT FROM s.price
--   ORDER BY b.booking_date DESC;
