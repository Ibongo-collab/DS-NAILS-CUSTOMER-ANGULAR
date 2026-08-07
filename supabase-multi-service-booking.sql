-- ============================================
-- PLUSIEURS PRESTATIONS SUR UN MÊME RENDEZ-VOUS
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- « Vendredi 7, nattes collées + manucure simple » est UN rendez-vous, pas
-- deux. On garde donc une seule ligne dans `bookings` — le créneau réservé
-- couvre la somme des durées — et on détaille les prestations dans une table
-- de liaison.
--
-- Deux garanties posées précédemment restent ainsi intactes :
--   • `has_active_booking` continue de refuser deux rendez-vous le même jour
--     pour la même personne (garde-fou anti-spam) ;
--   • `bookings_no_overlap` protège le créneau, puisqu'il n'y a qu'un
--     intervalle à comparer.
--
-- `bookings.service_id` est conservée : elle porte la prestation principale —
-- la plus longue. Tout ce qui la lit déjà continue de fonctionner.
--
-- Prérequis : supabase-no-overlap.sql (dernière version de create_booking).

-- ============================================
-- 1. TABLE DE LIAISON
-- ============================================

CREATE TABLE IF NOT EXISTS public.booking_services (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    service_id    UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    -- Prix figé de CETTE ligne, remise déduite. Leur somme vaut
    -- `bookings.price_at_booking`, qui reste la source de vérité comptable.
    price_at_booking NUMERIC(10,2),
    duration_minutes INTEGER NOT NULL,
    -- Ordre d'exécution, tel que choisi par la cliente
    position      SMALLINT NOT NULL DEFAULT 0,
    /**
     * Prestation réellement réalisée. Passe à FALSE quand la cliente y renonce
     * au dernier moment : la ligne est CONSERVÉE, pas supprimée. On sait ainsi
     * ce qui avait été réservé et ce qui a été abandonné — une information que
     * la suppression aurait fait disparaître sans laisser de trace.
     */
    fulfilled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rejouable : la colonne a pu être ajoutée après la première exécution
ALTER TABLE public.booking_services
    ADD COLUMN IF NOT EXISTS fulfilled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON TABLE public.booking_services IS
    'Prestations d''un rendez-vous. La somme des price_at_booking vaut celui de la réservation, qui reste la référence comptable.';

CREATE INDEX IF NOT EXISTS idx_booking_services_booking ON public.booking_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_service ON public.booking_services(service_id);

-- Une prestation ne figure qu'une fois par rendez-vous.
CREATE UNIQUE INDEX IF NOT EXISTS unique_service_per_booking
    ON public.booking_services(booking_id, service_id);

-- ============================================
-- 2. REPRISE DE L'EXISTANT
-- ============================================
-- Chaque réservation déjà en base devient un rendez-vous à une prestation.
-- Sans cela, les statistiques qui liront la table de liaison ignoreraient tout
-- l'historique.

INSERT INTO public.booking_services (booking_id, service_id, price_at_booking, duration_minutes, position)
SELECT b.id, b.service_id, b.price_at_booking, COALESCE(s.duration_minutes, 0), 0
FROM public.bookings b
JOIN public.services s ON s.id = b.service_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = b.id
);

-- ============================================
-- 3. DROITS
-- ============================================
-- Mêmes règles que la réservation dont elles dépendent : sa cliente ou un
-- administrateur. Une ligne ne doit pas être plus lisible que son rendez-vous.

ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des prestations de ses réservations" ON public.booking_services;
CREATE POLICY "Lecture des prestations de ses réservations"
    ON public.booking_services FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_id
              AND (b.client_email = auth.email() OR public.is_admin())
        )
    );

-- Aucune policy d'écriture : seule `create_booking`, en SECURITY DEFINER,
-- alimente cette table.

-- ============================================
-- 4. CRÉATION D'UN RENDEZ-VOUS À PLUSIEURS PRESTATIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.create_booking(
    p_service_ids           UUID[],
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
    v_duration   INTEGER;
    v_price      NUMERIC(10,2);
    v_main       UUID;
    v_end_time   TIME;
    v_message    TEXT;
    v_id         UUID;
    v_count      INTEGER;
BEGIN
    IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Choisissez au moins une prestation.' USING ERRCODE = 'P0002';
    END IF;

    -- Une prestation ne s'ajoute qu'une fois à un rendez-vous. L'écran grise
    -- déjà celles retenues ; la règle est répétée ici pour qu'elle tienne
    -- aussi hors de l'application.
    IF array_length(p_service_ids, 1)
       <> (SELECT COUNT(DISTINCT x) FROM UNNEST(p_service_ids) AS x) THEN
        RAISE EXCEPTION 'Une même prestation ne peut être ajoutée qu''une fois.'
            USING ERRCODE = 'P0003';
    END IF;

    -- Toutes les prestations doivent exister et être proposées
    SELECT COUNT(*) INTO v_count
    FROM public.services
    WHERE id = ANY(p_service_ids) AND active = TRUE;

    IF v_count <> (SELECT COUNT(DISTINCT x) FROM UNNEST(p_service_ids) AS x) THEN
        RAISE EXCEPTION 'Prestation introuvable ou indisponible.' USING ERRCODE = 'P0002';
    END IF;

    -- Durée et prix du rendez-vous : la somme de ses prestations, toutes
    -- distinctes (contrôlé plus haut).
    SELECT SUM(s.duration_minutes),
           SUM(public.effective_price(s.id, p_booking_date))
    INTO v_duration, v_price
    FROM UNNEST(p_service_ids) AS sid
    JOIN public.services s ON s.id = sid;

    -- Prestation principale : la plus longue. C'est celle qui nomme le
    -- rendez-vous là où une seule peut être affichée.
    SELECT s.id INTO v_main
    FROM UNNEST(p_service_ids) AS sid
    JOIN public.services s ON s.id = sid
    ORDER BY s.duration_minutes DESC, s.name
    LIMIT 1;

    v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

    -- `TIME` boucle au-delà de minuit : le rendez-vous se terminerait « avant »
    -- d'avoir commencé. D'autant plus probable avec plusieurs prestations.
    IF v_end_time <= p_start_time THEN
        RAISE EXCEPTION 'Ces prestations ne tiennent pas dans une journée : retirez-en une.'
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
        v_main, p_client_name, p_client_phone, p_client_email,
        p_booking_date, p_start_time, v_end_time, 'pending',
        COALESCE(p_whatsapp_notification, FALSE), p_notes, v_price, auth.uid()
    )
    RETURNING id INTO v_id;

    INSERT INTO public.booking_services
        (booking_id, service_id, price_at_booking, duration_minutes, position)
    SELECT v_id, s.id,
           public.effective_price(s.id, p_booking_date),
           s.duration_minutes,
           ordinalite - 1
    FROM UNNEST(p_service_ids) WITH ORDINALITY AS t(sid, ordinalite)
    JOIN public.services s ON s.id = t.sid;

    RETURN v_id;

EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
        RAISE EXCEPTION 'Ce créneau vient d''être réservé par quelqu''un d''autre.'
            USING ERRCODE = 'P0004';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking(UUID[], TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID[], TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT) TO anon, authenticated;

-- L'ancienne signature à une seule prestation n'a plus d'appelant. La laisser
-- exposerait deux fonctions de même nom : PostgREST pourrait appeler celle qui
-- n'alimente pas la table de liaison.
DROP FUNCTION IF EXISTS public.create_booking(UUID, TEXT, TEXT, TEXT, DATE, TIME, BOOLEAN, TEXT);

-- ============================================
-- 5. DURÉE TOTALE, POUR LE CALCUL DES CRÉNEAUX
-- ============================================
-- L'écran de choix de la date doit connaître la durée cumulée avant même
-- qu'une réservation existe.

CREATE OR REPLACE FUNCTION public.total_duration(p_service_ids UUID[])
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(s.duration_minutes), 0)::INTEGER
    FROM UNNEST(COALESCE(p_service_ids, ARRAY[]::UUID[])) AS sid
    JOIN public.services s ON s.id = sid;
$$;

REVOKE EXECUTE ON FUNCTION public.total_duration(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.total_duration(UUID[]) TO anon, authenticated;

-- ============================================
-- 6. CLÔTURE : TOUTES LES PRESTATIONS N'ONT PAS FORCÉMENT ÉTÉ RENDUES
-- ============================================
-- Sur trois prestations réservées, la cliente peut renoncer à la dernière. Il
-- ne suffit pas de baisser le montant : la composition doit suivre, sinon une
-- prestation non rendue continuerait d'alimenter les classements et la somme
-- des lignes ne vaudrait plus le total.
--
-- La durée du rendez-vous est réajustée dans la foulée — le planning doit
-- montrer l'occupation réelle du salon, pas celle qui était prévue.

CREATE OR REPLACE FUNCTION public.complete_booking(
    p_id          UUID,
    p_amount      NUMERIC,
    -- Prestations réellement réalisées. NULL = toutes celles réservées.
    p_service_ids UUID[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status   TEXT;
    v_start    TIME;
    v_duration INTEGER;
    v_main     UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur peut clôturer une réservation.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT status, start_time INTO v_status, v_start
    FROM public.bookings WHERE id = p_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Réservation introuvable.' USING ERRCODE = 'P0002';
    END IF;

    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'Une réservation annulée ne peut pas être clôturée.'
            USING ERRCODE = 'P0003';
    END IF;

    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'Le montant encaissé ne peut pas être négatif.'
            USING ERRCODE = 'P0003';
    END IF;

    IF p_service_ids IS NOT NULL THEN
        IF array_length(p_service_ids, 1) IS NULL THEN
            RAISE EXCEPTION 'Gardez au moins une prestation. Pour tout annuler, utilisez « Annuler ».'
                USING ERRCODE = 'P0003';
        END IF;

        -- Les prestations écartées sont MARQUÉES, jamais supprimées : on doit
        -- pouvoir dire plus tard ce qui avait été réservé et ce qui a été
        -- abandonné. L'affectation vaut dans les deux sens, ce qui permet de
        -- revenir sur une clôture.
        UPDATE public.booking_services
        SET fulfilled = (service_id = ANY(p_service_ids))
        WHERE booking_id = p_id;

        IF NOT EXISTS (
            SELECT 1 FROM public.booking_services
            WHERE booking_id = p_id AND fulfilled
        ) THEN
            RAISE EXCEPTION 'Gardez au moins une prestation. Pour tout annuler, utilisez « Annuler ».'
                USING ERRCODE = 'P0003';
        END IF;
    END IF;

    -- Durée réellement occupée et prestation principale : sur les seules
    -- prestations réalisées. Celle qui nommait le rendez-vous a pu être
    -- abandonnée.
    SELECT SUM(bs.duration_minutes) INTO v_duration
    FROM public.booking_services bs
    WHERE bs.booking_id = p_id AND bs.fulfilled;

    SELECT bs.service_id INTO v_main
    FROM public.booking_services bs
    WHERE bs.booking_id = p_id AND bs.fulfilled
    ORDER BY bs.duration_minutes DESC, bs.position
    LIMIT 1;

    UPDATE public.bookings
    SET status = 'completed',
        price_at_booking = ROUND(p_amount, 2),
        service_id = COALESCE(v_main, service_id),
        end_time = CASE
            WHEN v_duration IS NULL OR v_duration <= 0 THEN end_time
            ELSE v_start + (v_duration || ' minutes')::INTERVAL
        END
    WHERE id = p_id;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_booking(UUID, NUMERIC, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_booking(UUID, NUMERIC, UUID[]) TO authenticated;

-- ============================================
-- 7. VÉRIFICATIONS
-- ============================================
-- Chaque réservation a-t-elle bien ses lignes ?
--   SELECT COUNT(*) AS sans_ligne FROM public.bookings b
--   WHERE NOT EXISTS (SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = b.id);
--   -- attendu : 0
--
-- Les totaux concordent-ils ?
--   SELECT b.id, b.price_at_booking AS total,
--          SUM(bs.price_at_booking) AS somme_des_lignes
--   FROM public.bookings b
--   JOIN public.booking_services bs ON bs.booking_id = b.id
--   GROUP BY b.id, b.price_at_booking
--   HAVING b.price_at_booking IS DISTINCT FROM SUM(bs.price_at_booking);
--   -- attendu : aucune ligne
--
-- Prestations abandonnées au dernier moment (rien n'est supprimé) :
--   SELECT b.booking_date, b.client_name, s.name AS prestation_abandonnee,
--          bs.price_at_booking AS montant_non_encaisse
--   FROM public.booking_services bs
--   JOIN public.bookings b ON b.id = bs.booking_id
--   JOIN public.services s ON s.id = bs.service_id
--   WHERE NOT bs.fulfilled
--   ORDER BY b.booking_date DESC;
--
-- Rendez-vous à plusieurs prestations :
--   SELECT b.booking_date, b.client_name, b.start_time, b.end_time,
--          STRING_AGG(s.name, ' + ' ORDER BY bs.position) AS prestations
--   FROM public.bookings b
--   JOIN public.booking_services bs ON bs.booking_id = b.id
--   JOIN public.services s ON s.id = bs.service_id
--   GROUP BY b.id, b.booking_date, b.client_name, b.start_time, b.end_time
--   HAVING COUNT(*) > 1
--   ORDER BY b.booking_date DESC;
