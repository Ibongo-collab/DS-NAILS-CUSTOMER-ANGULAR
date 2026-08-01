-- ============================================
-- NOTIFICATIONS — file d'attente et déclencheurs
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Principe : la base ne fait qu'ENREGISTRER ce qui doit partir. L'envoi réel
-- est confié à une Edge Function, seule à détenir les identifiants du
-- fournisseur. Tant qu'aucun numéro WhatsApp n'est disponible, les messages
-- sont calculés et consultables sans être envoyés — rien n'est perdu.
--
-- Prérequis : supabase-admin-role.sql (public.is_admin())
--             supabase-bookings-user-link.sql (dernière version de bookings)

-- ============================================
-- 1. RÉGLAGES DU SALON
-- ============================================
-- Table à une seule ligne : le numéro de la gérante et les interrupteurs.
-- Séparée des comptes : le destinataire des alertes est un réglage du salon,
-- pas une propriété d'un utilisateur donné.

CREATE TABLE IF NOT EXISTS public.notification_settings (
    id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    admin_phone     TEXT,
    notify_admin    BOOLEAN NOT NULL DEFAULT TRUE,
    notify_client   BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notification_settings IS
    'Ligne unique (id = true). Paramètres d''envoi des notifications.';

INSERT INTO public.notification_settings (id, admin_phone)
VALUES (TRUE, '+242065137136')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Un admin lit les réglages de notification" ON public.notification_settings;
CREATE POLICY "Un admin lit les réglages de notification"
    ON public.notification_settings FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Un admin modifie les réglages de notification" ON public.notification_settings;
CREATE POLICY "Un admin modifie les réglages de notification"
    ON public.notification_settings FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================
-- 2. JOURNAL DES ENVOIS
-- ============================================
-- Sans ce journal, impossible de savoir si un rappel est parti — et le moindre
-- incident se solderait par des doublons. C'est aussi lui qui rend le mode
-- simulation utile : on y lit exactement ce qui serait envoyé.

CREATE TABLE IF NOT EXISTS public.notification_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id   UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    event        TEXT NOT NULL,
    audience     TEXT NOT NULL CHECK (audience IN ('admin', 'client')),
    channel      TEXT NOT NULL DEFAULT 'whatsapp',
    recipient    TEXT,
    message      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'sent', 'failed', 'simulated', 'skipped')),
    error        TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_log_status  ON public.notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON public.notification_log(created_at DESC);

-- Empêche le doublon de rappel : un seul par réservation, quoi qu'il arrive.
CREATE UNIQUE INDEX IF NOT EXISTS unique_reminder_per_booking
    ON public.notification_log(booking_id, event)
    WHERE event = 'booking_reminder';

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux admins : le journal contient numéros et noms.
DROP POLICY IF EXISTS "Un admin lit le journal des notifications" ON public.notification_log;
CREATE POLICY "Un admin lit le journal des notifications"
    ON public.notification_log FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Aucune policy d'écriture : seules les fonctions SECURITY DEFINER ci-dessous
-- et la clé de service (Edge Function) y écrivent.

-- ============================================
-- 3. MISE EN FILE
-- ============================================

CREATE OR REPLACE FUNCTION public.queue_notification(
    p_booking_id UUID,
    p_event      TEXT,
    p_audience   TEXT,
    p_recipient  TEXT,
    p_message    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings public.notification_settings%ROWTYPE;
BEGIN
    SELECT * INTO v_settings FROM public.notification_settings WHERE id;

    -- Interrupteur par public : couper les alertes admin ne doit pas couper
    -- les rappels clientes, et inversement.
    IF p_audience = 'admin'  AND NOT COALESCE(v_settings.notify_admin, TRUE)  THEN RETURN; END IF;
    IF p_audience = 'client' AND NOT COALESCE(v_settings.notify_client, TRUE) THEN RETURN; END IF;

    -- Sans numéro, on trace quand même : la trace dit pourquoi rien n'est parti
    INSERT INTO public.notification_log (booking_id, event, audience, recipient, message, status)
    VALUES (
        p_booking_id, p_event, p_audience, NULLIF(TRIM(COALESCE(p_recipient, '')), ''), p_message,
        CASE WHEN NULLIF(TRIM(COALESCE(p_recipient, '')), '') IS NULL THEN 'skipped' ELSE 'queued' END
    )
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.queue_notification(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- ============================================
-- 4. RÉDACTION DES MESSAGES
-- ============================================
-- Centralisée ici pour que les triggers et la tâche planifiée parlent d'une
-- seule voix. Les dates sont formatées en français.

CREATE OR REPLACE FUNCTION public.booking_summary(p_booking public.bookings)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_service TEXT;
    v_mois    TEXT[] := ARRAY['janvier','février','mars','avril','mai','juin',
                              'juillet','août','septembre','octobre','novembre','décembre'];
BEGIN
    SELECT name INTO v_service FROM public.services WHERE id = p_booking.service_id;

    RETURN COALESCE(v_service, 'Prestation')
        || ' le ' || EXTRACT(DAY FROM p_booking.booking_date)::INT
        || ' ' || v_mois[EXTRACT(MONTH FROM p_booking.booking_date)::INT]
        || ' ' || EXTRACT(YEAR FROM p_booking.booking_date)::INT
        || ' à ' || TO_CHAR(p_booking.start_time, 'HH24"h"MI');
END;
$$;

-- ============================================
-- 5. DÉCLENCHEURS SUR LES RÉSERVATIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.notify_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin TEXT;
BEGIN
    SELECT admin_phone INTO v_admin FROM public.notification_settings WHERE id;

    PERFORM public.queue_notification(
        NEW.id,
        'booking_created',
        'admin',
        v_admin,
        'Nouvelle réservation : ' || NEW.client_name
            || ' — ' || public.booking_summary(NEW)
            || '. Tél. ' || NEW.client_phone || '.'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
    AFTER INSERT ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_booking_created();

CREATE OR REPLACE FUNCTION public.notify_booking_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin  TEXT;
    v_resume TEXT;
    v_par_admin BOOLEAN;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT admin_phone INTO v_admin FROM public.notification_settings WHERE id;
    v_resume := public.booking_summary(NEW);

    -- Qui agit ? `is_admin()` répond pour l'utilisateur courant : c'est ce qui
    -- permet d'envoyer l'alerte à l'autre partie, et non à celle qui a agi.
    v_par_admin := public.is_admin();

    IF NEW.status = 'cancelled' THEN
        IF v_par_admin THEN
            PERFORM public.queue_notification(
                NEW.id, 'booking_cancelled_by_admin', 'client', NEW.client_phone,
                'Bonjour ' || NEW.client_name || ', votre rendez-vous chez DS Nails ('
                    || v_resume || ') a été annulé. Contactez-nous pour le reprogrammer.'
            );
        ELSE
            PERFORM public.queue_notification(
                NEW.id, 'booking_cancelled_by_client', 'admin', v_admin,
                'Annulation : ' || NEW.client_name || ' — ' || v_resume
                    || '. Le créneau est de nouveau libre.'
            );
        END IF;

    ELSIF NEW.status = 'confirmed' THEN
        PERFORM public.queue_notification(
            NEW.id, 'booking_confirmed', 'client', NEW.client_phone,
            'Bonjour ' || NEW.client_name || ', votre rendez-vous chez DS Nails est confirmé : '
                || v_resume || '. À bientôt !'
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
    AFTER UPDATE OF status ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_booking_status_changed();

-- ============================================
-- 6. RAPPELS À 24 HEURES
-- ============================================
-- Appelée périodiquement. L'index unique de la section 2 garantit qu'une
-- réservation ne peut recevoir qu'un seul rappel, même si la tâche tourne
-- deux fois ou rattrape un retard.

CREATE OR REPLACE FUNCTION public.queue_due_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_count   INTEGER := 0;
BEGIN
    FOR v_booking IN
        SELECT b.* FROM public.bookings b
        WHERE b.status IN ('pending', 'confirmed')
          AND b.whatsapp_notification = TRUE
          -- Fenêtre large : une exécution horaire ne doit pas rater un créneau
          AND (b.booking_date + b.start_time) BETWEEN NOW() + INTERVAL '23 hours'
                                                  AND NOW() + INTERVAL '25 hours'
          AND NOT EXISTS (
              SELECT 1 FROM public.notification_log n
              WHERE n.booking_id = b.id AND n.event = 'booking_reminder'
          )
    LOOP
        PERFORM public.queue_notification(
            v_booking.id, 'booking_reminder', 'client', v_booking.client_phone,
            'Bonjour ' || v_booking.client_name || ', rappel de votre rendez-vous chez DS Nails demain : '
                || public.booking_summary(v_booking) || '. À demain !'
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.queue_due_reminders() FROM PUBLIC;

-- ============================================
-- 7. PLANIFICATION
-- ============================================
-- Nécessite l'extension pg_cron (Database > Extensions dans le dashboard).
-- Toutes les heures : la fenêtre de deux heures de la section 6 absorbe les
-- décalages et les exécutions manquées.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    PERFORM cron.unschedule('ds-nails-reminders');
EXCEPTION WHEN OTHERS THEN
    NULL; -- la tâche n'existait pas encore
END $$;

SELECT cron.schedule(
    'ds-nails-reminders',
    '0 * * * *',
    $$ SELECT public.queue_due_reminders(); $$
);

-- ============================================
-- 8. VÉRIFICATIONS
-- ============================================
-- Ce qui attend d'être envoyé :
--   SELECT created_at, event, audience, recipient, status, message
--   FROM public.notification_log ORDER BY created_at DESC LIMIT 20;
--
-- Répartition par état :
--   SELECT status, COUNT(*) FROM public.notification_log GROUP BY status;
--
-- Simuler le passage des rappels sans attendre l'heure ronde :
--   SELECT public.queue_due_reminders();
--
-- La tâche planifiée est-elle active ?
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'ds-nails-reminders';
--
-- Changer le numéro de la gérante :
--   UPDATE public.notification_settings SET admin_phone = '+242...' WHERE id;
--
-- Couper temporairement un public :
--   UPDATE public.notification_settings SET notify_client = FALSE WHERE id;
