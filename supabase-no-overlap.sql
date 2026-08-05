-- ============================================
-- DEUX RÉSERVATIONS NE PEUVENT PLUS SE CHEVAUCHER
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Ce qui existait déjà :
--
--   1. `create_booking` refuse un créneau qui chevauche une réservation en
--      attente ou confirmée ;
--   2. l'index `unique_booking_slot` interdit deux réservations à la MÊME
--      heure de début.
--
-- Ce qui manquait. Le contrôle nº 1 lit la table, puis insère : entre les
-- deux, une autre transaction peut insérer sans être vue (niveau READ
-- COMMITTED). Deux clientes qui valident dans la même seconde passent donc
-- toutes les deux. Le filet nº 2 ne les rattrape que si leurs heures de début
-- sont identiques — or deux rendez-vous peuvent se chevaucher sans commencer
-- en même temps :
--
--   Braids   09:00 → 11:20
--   Manucure       10:00 → 11:00     ← chevauche, heures de début différentes
--
-- Seule une contrainte d'exclusion, évaluée par l'index au moment de
-- l'insertion, ferme la fenêtre : la base sérialise, aucune application ne
-- peut se glisser entre le contrôle et l'écriture.
--
-- Prérequis : supabase-promotions.sql. Ce fichier redéfinit `create_booking`
-- et devient à son tour la dernière version en date.

-- ============================================
-- 1. ÉTAT DES LIEUX AVANT VERROUILLAGE
-- ============================================
-- La contrainte refusera de se poser si des chevauchements existent déjà.
-- Plutôt qu'un message technique, on liste précisément les cas à traiter.

DO $$
DECLARE
    v_inverses INTEGER;
    v_chevauchements INTEGER;
    v_detail TEXT;
BEGIN
    -- Heure de fin antérieure à l'heure de début : impossible à représenter
    -- comme un intervalle. Cela n'arrive que si une prestation déborde de
    -- minuit (`TIME` boucle : 23:00 + 2 h = 01:00).
    SELECT COUNT(*) INTO v_inverses
    FROM public.bookings
    WHERE status IN ('pending', 'confirmed')
      AND end_time <= start_time;

    IF v_inverses > 0 THEN
        RAISE EXCEPTION
            '% réservation(s) ont une heure de fin antérieure au début (prestation à cheval sur minuit). Corrigez-les avant de rejouer ce script.',
            v_inverses;
    END IF;

    SELECT COUNT(*), STRING_AGG(DISTINCT detail, E'\n  ' ORDER BY detail)
    INTO v_chevauchements, v_detail
    FROM (
        SELECT a.booking_date || ' : ' || a.client_name || ' ' ||
               a.start_time || '-' || a.end_time || '  ⨯  ' ||
               b.client_name || ' ' || b.start_time || '-' || b.end_time AS detail
        FROM public.bookings a
        JOIN public.bookings b
          ON a.booking_date = b.booking_date
         AND a.id < b.id
         AND a.start_time < b.end_time
         AND a.end_time > b.start_time
        WHERE a.status IN ('pending', 'confirmed')
          AND b.status IN ('pending', 'confirmed')
    ) conflits;

    IF v_chevauchements > 0 THEN
        RAISE EXCEPTION E'% chevauchement(s) déjà en base. Annulez ou déplacez l''une des réservations de chaque paire, puis rejouez ce script :\n  %',
            v_chevauchements, v_detail;
    END IF;
END $$;

-- ============================================
-- 2. LA CONTRAINTE
-- ============================================
-- `btree_gist` permet de mélanger une égalité simple et un opérateur
-- d'intervalle dans un même index. La date est incorporée à l'intervalle, ce
-- qui évite d'avoir à la comparer séparément.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;

ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_no_overlap
    EXCLUDE USING gist (
        -- Borne de fin exclue : un rendez-vous 09:00-10:00 et un autre
        -- 10:00-11:00 se suivent, ils ne se chevauchent pas.
        tsrange(booking_date + start_time, booking_date + end_time, '[)') WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'));

COMMENT ON CONSTRAINT bookings_no_overlap ON public.bookings IS
    'Interdit deux rendez-vous simultanés. Ne vise que les statuts « pending » et « confirmed » : une réservation annulée libère son créneau, et une prestation saisie manuellement (« completed ») reporte le cahier sans contrôle de planning.';

-- ============================================
-- 3. UN MESSAGE LISIBLE PLUTÔT QU'UNE ERREUR TECHNIQUE
-- ============================================
-- La contrainte lève une erreur 23P01. Sans traduction, la cliente verrait le
-- nom de l'index. On la rattrape, et on refuse en amont les prestations qui
-- déborderaient de minuit — la contrainte ne saurait pas les représenter.

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
    SELECT duration_minutes INTO v_duration
    FROM public.services
    WHERE id = p_service_id AND active = TRUE;

    IF v_duration IS NULL THEN
        RAISE EXCEPTION 'Prestation introuvable ou indisponible.'
            USING ERRCODE = 'P0002';
    END IF;

    -- Prix remise déduite, calculé pour la date du rendez-vous
    v_price := public.effective_price(p_service_id, p_booking_date);

    v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

    -- `TIME` boucle au-delà de minuit : 23:00 + 2 h donne 01:00. Le rendez-vous
    -- se terminerait « avant » d'avoir commencé.
    IF v_end_time <= p_start_time THEN
        RAISE EXCEPTION 'Cette prestation ne peut pas se terminer après minuit.'
            USING ERRCODE = 'P0003';
    END IF;

    IF auth.uid() IS NOT NULL AND p_client_email IS NOT NULL THEN
        v_message := public.has_active_booking(p_client_email, NULL, p_booking_date);
    ELSE
        v_message := public.has_active_booking(NULL, p_client_phone, p_booking_date);
    END IF;

    IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'P0003';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.opening_hours
        WHERE day_of_week = EXTRACT(ISODOW FROM p_booking_date)
          AND is_closed = TRUE
    ) THEN
        RAISE EXCEPTION 'Le salon est fermé à cette date.' USING ERRCODE = 'P0003';
    END IF;

    -- Ce contrôle reste utile : il donne un message clair dans le cas courant.
    -- Ce n'est plus lui qui garantit l'exclusion, c'est la contrainte.
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
        whatsapp_notification, notes, price_at_booking, user_id
    ) VALUES (
        p_service_id, p_client_name, p_client_phone, p_client_email,
        p_booking_date, p_start_time, v_end_time, 'pending',
        COALESCE(p_whatsapp_notification, FALSE), p_notes, v_price, auth.uid()
    )
    RETURNING id INTO v_id;

    RETURN v_id;

EXCEPTION
    -- Deux validations simultanées : celle qui perd la course arrive ici.
    WHEN exclusion_violation OR unique_violation THEN
        RAISE EXCEPTION 'Ce créneau vient d''être réservé par quelqu''un d''autre.'
            USING ERRCODE = 'P0004';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================
-- 4. VÉRIFICATIONS
-- ============================================
-- La contrainte est-elle en place ?
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_no_overlap';
--
-- Test manuel (à jouer dans une transaction annulée ensuite) :
--   BEGIN;
--   INSERT INTO public.bookings
--     (service_id, client_name, client_phone, client_email,
--      booking_date, start_time, end_time, status)
--   SELECT id, 'Test A', '0000', 'a@test.fr', CURRENT_DATE + 400, '09:00', '11:00', 'pending'
--   FROM public.services LIMIT 1;
--
--   -- Doit échouer : chevauche le précédent sans avoir la même heure de début
--   INSERT INTO public.bookings
--     (service_id, client_name, client_phone, client_email,
--      booking_date, start_time, end_time, status)
--   SELECT id, 'Test B', '0000', 'b@test.fr', CURRENT_DATE + 400, '10:00', '12:00', 'pending'
--   FROM public.services LIMIT 1;
--   ROLLBACK;
--
-- Ce qui reste autorisé, volontairement :
--   • deux rendez-vous qui se suivent (09:00-10:00 puis 10:00-11:00) ;
--   • une saisie manuelle (statut « completed ») sur un créneau occupé — le
--     cahier fait autorité, cf. supabase-manual-booking.sql ;
--   • réserver un créneau libéré par une annulation.
