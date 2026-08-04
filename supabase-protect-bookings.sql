-- ============================================
-- INTERDIRE TOUTE SUPPRESSION DE RÉSERVATION
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Une réservation supprimée, c'est du chiffre d'affaires et un historique
-- perdus sans trace. L'audit a mis au jour TROIS chemins de suppression :
--
--   1. La clé étrangère `bookings.service_id` était en ON DELETE CASCADE :
--      supprimer une prestation depuis l'administration effaçait
--      silencieusement TOUTES ses réservations, passées comprises.
--   2. Une policy RLS autorisait un administrateur à supprimer une réservation.
--   3. `cleanup_expired_bookings()` supprimait les réservations en attente
--      expirées, au lieu de les marquer annulées.
--
-- Ce script les ferme tous les trois, et pose un garde-fou qui rend la
-- suppression impossible même par un chemin non prévu.

-- ============================================
-- 1. LE GARDE-FOU
-- ============================================
-- Un trigger BEFORE DELETE se déclenche AUSSI lors d'une suppression en
-- cascade : c'est ce qui en fait une garantie, et non une simple politique.

CREATE OR REPLACE FUNCTION public.prevent_booking_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Une réservation ne peut pas être supprimée (%, le %). Utilisez le statut « annulée ».',
        OLD.client_name, OLD.booking_date
        USING ERRCODE = 'P0006';
END;
$$;

DROP TRIGGER IF EXISTS bookings_no_delete ON public.bookings;
CREATE TRIGGER bookings_no_delete
    BEFORE DELETE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_booking_delete();

-- ============================================
-- 2. FIN DE LA CASCADE DEPUIS LES PRESTATIONS
-- ============================================
-- En RESTRICT, la base refuse de supprimer une prestation encore réservée.
-- L'administration affiche déjà le message correspondant et invite à masquer
-- la prestation plutôt qu'à la supprimer — ce comportement devient réel.

ALTER TABLE public.bookings
    DROP CONSTRAINT IF EXISTS bookings_service_id_fkey;

ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE RESTRICT;

-- ============================================
-- 3. RETRAIT DU DROIT DE SUPPRESSION
-- ============================================
-- Le trigger suffirait, mais laisser la policy en place laisserait croire que
-- l'opération est permise : l'erreur surviendrait au dernier moment.

DROP POLICY IF EXISTS "Un admin supprime une réservation" ON public.bookings;

-- ============================================
-- 4. EXPIRATION SANS SUPPRESSION
-- ============================================
-- Une réservation en attente jamais confirmée doit libérer son créneau, pas
-- disparaître : on l'annule. Elle reste visible et compte dans le taux de
-- désistement.

CREATE OR REPLACE FUNCTION public.cleanup_expired_bookings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.bookings
    SET status = 'cancelled'
    WHERE status = 'pending'
      AND expires_at < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_bookings() FROM PUBLIC;

-- ============================================
-- 5. VÉRIFICATIONS
-- ============================================
-- Le garde-fou est-il en place ?
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.bookings'::regclass AND tgname = 'bookings_no_delete';
--
-- La clé étrangère n'est plus en cascade ? (attendu : « a » = NO ACTION/RESTRICT)
--   SELECT confdeltype FROM pg_constraint WHERE conname = 'bookings_service_id_fkey';
--   -- 'c' = CASCADE (à proscrire), 'r' = RESTRICT, 'a' = NO ACTION, 'n' = SET NULL
--
-- Plus aucune policy de suppression sur les réservations (attendu : 0 ligne) :
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'bookings' AND cmd = 'DELETE';
--
-- Test réel — doit échouer avec « Une réservation ne peut pas être supprimée » :
--   DELETE FROM public.bookings WHERE id = (SELECT id FROM public.bookings LIMIT 1);
--
-- Test de la cascade — doit échouer si la prestation a des réservations :
--   DELETE FROM public.services WHERE id = (
--     SELECT service_id FROM public.bookings LIMIT 1
--   );
