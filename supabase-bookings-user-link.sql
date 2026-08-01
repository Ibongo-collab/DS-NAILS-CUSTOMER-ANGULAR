-- ============================================
-- RATTACHER LES RÉSERVATIONS AU COMPTE, PAS À L'E-MAIL
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Jusqu'ici une réservation était reliée à sa cliente par `client_email`.
-- Conséquence : dès qu'une cliente change d'adresse, son historique disparaît —
-- la requête ne la retrouve plus, et la policy RLS (client_email = auth.email())
-- ne l'autorise plus à la lire.
--
-- On ajoute donc un vrai lien vers le compte. `client_email` reste, mais comme
-- trace de l'adresse saisie à la réservation, plus comme identifiant.
--
-- Prérequis : supabase-secure-bookings.sql.
--
-- ⚠ ORDRE DES MIGRATIONS
-- Ce fichier redéfinit `create_booking` avec sa version la plus récente : il
-- doit être joué EN DERNIER. Ne rejouez pas supabase-price-at-booking.sql
-- après lui — sa version de la fonction est antérieure et ignore `user_id`.
-- Les colonnes dont il dépend sont créées ici même, en section 0, pour qu'il
-- fonctionne quel que soit ce qui a été exécuté avant.

-- ============================================
-- 0. COLONNES REQUISES PAR LA FONCTION
-- ============================================
-- `price_at_booking` vient normalement de supabase-price-at-booking.sql.
-- On la recrée ici si elle manque : sans elle, l'insertion échoue avec
-- « column price_at_booking of relation bookings does not exist ».

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS price_at_booking NUMERIC(10,2);

COMMENT ON COLUMN public.bookings.price_at_booking IS
    'Tarif de la prestation au moment de la réservation. Figé : ne pas recalculer.';

-- Réservations antérieures : on les initialise au tarif courant, seule
-- approximation disponible. Ne touche pas aux lignes déjà renseignées.
UPDATE public.bookings b
SET price_at_booking = s.price
FROM public.services s
WHERE b.service_id = s.id
  AND b.price_at_booking IS NULL;

-- ============================================
-- 1. COLONNE DE LIAISON
-- ============================================

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bookings.user_id IS
    'Compte ayant réservé. NULL pour une réservation prise sans être connecté.';

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);

-- ============================================
-- 2. REPRISE DE L'EXISTANT
-- ============================================
-- On relie les réservations dont l'e-mail correspond ENCORE à un compte.
--
-- ⚠ Les clientes ayant déjà changé d'adresse ne seront pas rattrapées ici :
-- le lien est précisément ce qui a été perdu. Voir la section 5 pour la
-- réparation manuelle de ces cas.

UPDATE public.bookings b
SET user_id = u.id
FROM auth.users u
WHERE b.user_id IS NULL
  AND lower(b.client_email) = lower(u.email);

-- ============================================
-- 3. RENSEIGNEMENT À LA CRÉATION
-- ============================================
-- Seul l'INSERT change : auth.uid() vaut NULL pour une invitée, ce qui est
-- exactement le comportement voulu.

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
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Ce créneau vient d''être réservé par quelqu''un d''autre.'
            USING ERRCODE = 'P0004';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================
-- 4. POLICIES : LE COMPTE D'ABORD, L'E-MAIL EN SECOURS
-- ============================================
-- Le repli sur l'e-mail couvre les réservations prises en invitée avec la même
-- adresse, avant la création du compte : elles n'ont pas de user_id.

DROP POLICY IF EXISTS "Lecture de ses propres réservations" ON public.bookings;
CREATE POLICY "Lecture de ses propres réservations"
    ON public.bookings FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR client_email = auth.email());

DROP POLICY IF EXISTS "Authenticated users can cancel their own bookings" ON public.bookings;
CREATE POLICY "Authenticated users can cancel their own bookings"
    ON public.bookings FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() OR client_email = auth.email())
    WITH CHECK (user_id = auth.uid() OR client_email = auth.email());

-- ============================================
-- 5. RÉPARER UN HISTORIQUE DÉJÀ ORPHELIN
-- ============================================
-- Pour une cliente ayant changé d'adresse AVANT cette migration, le lien est
-- perdu : la section 2 ne peut pas la retrouver. Rattachement manuel, en
-- indiquant l'ancienne adresse et la nouvelle :
--
--   UPDATE public.bookings b
--   SET user_id = u.id
--   FROM auth.users u
--   WHERE lower(b.client_email) = lower('ancienne@adresse.com')
--     AND lower(u.email)        = lower('nouvelle@adresse.com')
--     AND b.user_id IS NULL;
--
-- Contrôle avant/après :
--   SELECT client_email, user_id, booking_date, status
--   FROM public.bookings ORDER BY booking_date DESC;
--
-- ============================================
-- 6. VÉRIFICATIONS
-- ============================================
-- Réservations non rattachées à un compte (normal pour les invitées) :
--   SELECT COUNT(*) FROM public.bookings WHERE user_id IS NULL;
--
-- Réservations orphelines alors que l'e-mail ressemble à un compte connu :
--   SELECT b.id, b.client_email, b.booking_date
--   FROM public.bookings b
--   WHERE b.user_id IS NULL
--     AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(b.client_email));
