-- ============================================
-- FERMETURE DE LA LECTURE PUBLIQUE DE `bookings`
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Avant : la policy « Anyone can read bookings » laissait n'importe quel
-- visiteur anonyme lire nom, téléphone et email de toutes les clientes.
--
-- Cette lecture existait pour une seule raison : calculer les créneaux libres
-- côté client. On déplace donc ce calcul dans des fonctions SECURITY DEFINER
-- qui n'exposent que le strict nécessaire (des intervalles horaires), puis on
-- supprime l'accès direct à la table.
--
-- Prérequis : supabase-admin-role.sql (fournit public.is_admin()).

-- ============================================
-- 1. RPC — INTERVALLES OCCUPÉS D'UNE JOURNÉE
-- ============================================
-- Ne renvoie que des heures : aucune donnée personnelle ne sort.

CREATE OR REPLACE FUNCTION public.get_booked_intervals(p_date DATE)
RETURNS TABLE (start_time TIME, end_time TIME)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT b.start_time, b.end_time
    FROM public.bookings b
    WHERE b.booking_date = p_date
      AND b.status IN ('pending', 'confirmed');
$$;

REVOKE EXECUTE ON FUNCTION public.get_booked_intervals(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booked_intervals(DATE) TO anon, authenticated;

-- ============================================
-- 2. RPC — RÉSERVATION ACTIVE DÉJÀ EXISTANTE
-- ============================================
-- Renvoie le message à afficher, ou NULL si la cliente peut réserver.
-- Ne renvoie jamais le détail de la réservation trouvée.

CREATE OR REPLACE FUNCTION public.has_active_booking(
    p_email  TEXT DEFAULT NULL,
    p_phone  TEXT DEFAULT NULL,
    p_date   DATE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_pending  BOOLEAN;
    v_same_day BOOLEAN;
BEGIN
    IF p_email IS NULL AND p_phone IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT
        bool_or(b.status = 'pending'),
        bool_or(p_date IS NOT NULL AND b.booking_date = p_date)
    INTO v_pending, v_same_day
    FROM public.bookings b
    WHERE b.status <> 'cancelled'
      AND (
            (p_email IS NOT NULL AND b.client_email = p_email)
         OR (p_phone IS NOT NULL AND b.client_phone = p_phone)
      );

    IF COALESCE(v_pending, FALSE) THEN
        RETURN CASE
            WHEN p_email IS NOT NULL THEN 'Vous avez déjà une réservation en attente.'
            ELSE 'Ce numéro a déjà une réservation en attente.'
        END;
    END IF;

    IF COALESCE(v_same_day, FALSE) THEN
        RETURN CASE
            WHEN p_email IS NOT NULL THEN 'Vous avez déjà une réservation prévue à cette date.'
            ELSE 'Ce numéro a déjà une réservation prévue à cette date.'
        END;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_active_booking(TEXT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_booking(TEXT, TEXT, DATE) TO anon, authenticated;

-- ============================================
-- 3. RPC — CRÉATION D'UNE RÉSERVATION
-- ============================================
-- Une fois la lecture fermée, `INSERT ... RETURNING` ne fonctionne plus pour un
-- visiteur anonyme (PostgREST exige un droit SELECT sur la ligne renvoyée).
-- Cette fonction porte donc la création, et devient au passage l'autorité sur
-- les règles métier : le client ne peut plus les contourner puisqu'il n'a plus
-- accès à la table en écriture directe.

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

    v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

    -- Doublon côté cliente. On reproduit la règle du front à l'identique :
    -- une cliente connectée est identifiée par son email, une invitée par son
    -- téléphone. Croiser les deux ici bloquerait des réservations that le
    -- parcours actuel accepte aujourd'hui.
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
        whatsapp_notification, notes
    ) VALUES (
        p_service_id, p_client_name, p_client_phone, p_client_email,
        p_booking_date, p_start_time, v_end_time, 'pending',
        COALESCE(p_whatsapp_notification, FALSE), p_notes
    )
    RETURNING id INTO v_id;

    RETURN v_id;

EXCEPTION
    -- L'index unique unique_booking_slot a tranché une course entre deux clientes
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Ce créneau vient d''être réservé par quelqu''un d''autre.'
            USING ERRCODE = 'P0004';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================
-- 4. NOUVELLES POLICIES SUR `bookings`
-- ============================================

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- On retire tout accès public : lecture ET écriture directe.
DROP POLICY IF EXISTS "Anyone can read bookings"                  ON public.bookings;
DROP POLICY IF EXISTS "Lecture des réservations confirmées"       ON public.bookings;
DROP POLICY IF EXISTS "Anyone can insert a booking"               ON public.bookings;
DROP POLICY IF EXISTS "Création de réservation publique"          ON public.bookings;

-- Lecture : uniquement ses propres réservations…
DROP POLICY IF EXISTS "Lecture de ses propres réservations" ON public.bookings;
CREATE POLICY "Lecture de ses propres réservations"
    ON public.bookings FOR SELECT
    TO authenticated
    USING (client_email = auth.email());

-- …ou tout, pour un admin.
DROP POLICY IF EXISTS "Un admin lit toutes les réservations" ON public.bookings;
CREATE POLICY "Un admin lit toutes les réservations"
    ON public.bookings FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Les policies d'écriture (annulation par la cliente, gestion admin) restent
-- celles déjà en place : « Authenticated users can cancel their own bookings »
-- et celles de supabase-admin-role.sql.

-- ============================================
-- 5. VUE DE STATISTIQUES
-- ============================================
-- Une vue s'exécute avec les droits de son propriétaire : exposée via l'API,
-- elle contournerait les policies ci-dessus. On la réserve aux admins.
--
-- La vue est optionnelle (elle n'existe que si supabase-schema.sql a été joué
-- en entier) : on ne révoque que si elle est présente, sinon le script entier
-- échouerait sur un objet absent.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_views
        WHERE schemaname = 'public' AND viewname = 'daily_bookings_stats'
    ) THEN
        EXECUTE 'REVOKE ALL ON public.daily_bookings_stats FROM anon, authenticated';
    END IF;
END $$;

-- ============================================
-- 6. VÉRIFICATIONS
-- ============================================
-- Doit renvoyer 0 ligne (aucune policy laissant `anon` lire la table) :
--   SELECT policyname, roles, cmd FROM pg_policies
--   WHERE tablename = 'bookings' AND cmd = 'SELECT' AND 'anon' = ANY(roles);
--
-- Doit fonctionner sans être connecté (créneaux occupés, sans données perso) :
--   SELECT * FROM public.get_booked_intervals(CURRENT_DATE);
--
-- Liste des policies restantes :
--   SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'bookings';
