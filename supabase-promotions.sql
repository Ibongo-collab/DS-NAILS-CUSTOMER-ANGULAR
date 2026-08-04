-- ============================================
-- PROMOTIONS
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Une promotion applique une remise en pourcentage, sur TOUTES les prestations
-- ou sur une seule, entre deux dates incluses.
--
-- ⚠ ORDRE DES MIGRATIONS
-- Ce fichier redéfinit `create_booking` avec sa version la plus récente : il
-- doit être joué APRÈS supabase-bookings-user-link.sql, et devient à son tour
-- la dernière version en date.
--
-- Prérequis : supabase-admin-role.sql, supabase-bookings-user-link.sql.

-- ============================================
-- 1. TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.promotions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    -- NULL = toutes les prestations ; sinon la promotion ne vise que celle-ci
    service_id       UUID REFERENCES public.services(id) ON DELETE CASCADE,
    starts_on        DATE NOT NULL,
    ends_on          DATE NOT NULL,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT promotion_dates_ordered CHECK (ends_on >= starts_on)
);

COMMENT ON COLUMN public.promotions.service_id IS
    'Prestation visée. NULL = la promotion s''applique à toutes.';

CREATE INDEX IF NOT EXISTS idx_promotions_window ON public.promotions(starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_promotions_service ON public.promotions(service_id);

-- ============================================
-- 2. REMISE APPLICABLE
-- ============================================
-- Règle en cas de cumul possible : c'est la remise la PLUS FORTE qui
-- l'emporte, jamais la somme. Additionner deux promotions pourrait dépasser
-- 100 % et produire un prix négatif ; et en cas de doute, la règle joue en
-- faveur de la cliente.

CREATE OR REPLACE FUNCTION public.active_discount(p_service_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(MAX(p.discount_percent), 0)
    FROM public.promotions p
    WHERE p.active
      AND p_date BETWEEN p.starts_on AND p.ends_on
      AND (p.service_id IS NULL OR p.service_id = p_service_id);
$$;

REVOKE EXECUTE ON FUNCTION public.active_discount(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_discount(UUID, DATE) TO anon, authenticated;

/** Prix réellement dû, remise déduite. */
CREATE OR REPLACE FUNCTION public.effective_price(p_service_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ROUND(s.price * (100 - public.active_discount(s.id, p_date)) / 100, 2)
    FROM public.services s
    WHERE s.id = p_service_id;
$$;

REVOKE EXECUTE ON FUNCTION public.effective_price(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_price(UUID, DATE) TO anon, authenticated;

-- ============================================
-- 3. DROITS
-- ============================================
-- Lecture publique : le site doit afficher les prix remisés.
-- Écriture réservée aux administrateurs.

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Les promotions sont visibles par tous" ON public.promotions;
CREATE POLICY "Les promotions sont visibles par tous"
    ON public.promotions FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Un admin crée une promotion" ON public.promotions;
CREATE POLICY "Un admin crée une promotion"
    ON public.promotions FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin modifie une promotion" ON public.promotions;
CREATE POLICY "Un admin modifie une promotion"
    ON public.promotions FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin supprime une promotion" ON public.promotions;
CREATE POLICY "Un admin supprime une promotion"
    ON public.promotions FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- ============================================
-- 4. LE PRIX FIGÉ TIENT COMPTE DE LA REMISE
-- ============================================
-- Point capital : `price_at_booking` doit enregistrer le montant RÉELLEMENT dû.
-- Sans cela, la cliente verrait un prix remisé et la comptabilité en
-- retiendrait un autre. La remise est celle en vigueur à la DATE DU
-- RENDEZ-VOUS, pas à la date de réservation.

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
-- 5. VÉRIFICATIONS
-- ============================================
-- Promotions en cours aujourd'hui :
--   SELECT name, discount_percent, starts_on, ends_on,
--          COALESCE((SELECT name FROM public.services WHERE id = p.service_id),
--                   'Toutes les prestations') AS portee
--   FROM public.promotions p
--   WHERE active AND CURRENT_DATE BETWEEN starts_on AND ends_on;
--
-- Effet sur les prix, prestation par prestation :
--   SELECT s.name, s.price AS prix_public,
--          public.active_discount(s.id) AS remise,
--          public.effective_price(s.id) AS prix_du
--   FROM public.services s WHERE s.active ORDER BY s.name;
--
-- Note : les réservations déjà enregistrées ne bougent pas. `price_at_booking`
-- est figé à la création — créer ou supprimer une promotion ne réécrit jamais
-- le chiffre d'affaires passé.
