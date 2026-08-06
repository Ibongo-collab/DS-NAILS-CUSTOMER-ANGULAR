-- ============================================
-- RÔLE SUPER ADMINISTRATEUR
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Un troisième rôle, au-dessus de `admin`, avec deux particularités :
--
--   • il peut SUPPRIMER une réservation, ce qu'aucun autre rôle ne peut faire ;
--   • il ne voit PAS les chiffres d'affaires (CA du mois, CA cumulé, panier
--     moyen, CA par mois). C'est un accès technique, pas un accès comptable.
--
-- ⚠ Cette migration ouvre une brèche dans une garantie posée volontairement :
-- `supabase-protect-bookings.sql` interdit toute suppression de réservation,
-- parce qu'une réservation effacée fausse durablement la comptabilité. La
-- brèche est donc **nominative** (un seul rôle) et **tracée** : chaque
-- suppression est archivée avec son auteur avant que la ligne ne disparaisse.
--
-- Prérequis : supabase-admin-role.sql.

-- ============================================
-- 1. LE RÔLE
-- ============================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('client', 'admin', 'super_admin'));

/**
 * `is_admin()` reste le socle : un super administrateur est aussi
 * administrateur. Toutes les policies existantes continuent donc de
 * s'appliquer à lui sans avoir à être réécrites.
 */
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============================================
-- 2. SEUL UN SUPER ADMIN NOMME UN SUPER ADMIN
-- ============================================
-- Sans cela, un administrateur pourrait se promouvoir lui-même et s'ouvrir le
-- droit de suppression. Le rôle le plus élevé ne doit pas être atteignable
-- depuis celui du dessous.

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL THEN

        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Seul un administrateur peut modifier un rôle.';
        END IF;

        -- Accorder ou retirer le rôle suprême reste entre super administrateurs
        IF (NEW.role = 'super_admin' OR OLD.role = 'super_admin')
           AND NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'Seul un super administrateur peut accorder ou retirer ce rôle.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Le trigger est déjà posé par supabase-admin-role.sql ; on ne redéfinit que
-- la fonction qu'il appelle.

-- ============================================
-- 3. NOMINATION
-- ============================================
-- Joué depuis l'éditeur SQL, `auth.uid()` est NULL : le trigger laisse passer.
-- C'est le même mécanisme d'amorçage que pour le premier administrateur.

UPDATE public.profiles
SET role = 'super_admin'
WHERE email = 'ibongookiessi@gmail.com';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin') THEN
        RAISE WARNING
            'Aucun super administrateur nommé : le compte ibongookiessi@gmail.com n''existe pas encore dans profiles. Créez-le, puis rejouez la section 3.';
    END IF;
END $$;

-- ============================================
-- 4. ARCHIVE DES SUPPRESSIONS
-- ============================================
-- Une réservation supprimée disparaît de l'application, mais pas de la base :
-- sans cette trace, un écart comptable resterait inexplicable.

CREATE TABLE IF NOT EXISTS public.deleted_bookings (
    id             UUID PRIMARY KEY,
    booking        JSONB NOT NULL,
    deleted_by     UUID,
    deleted_by_email TEXT,
    deleted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason         TEXT
);

COMMENT ON TABLE public.deleted_bookings IS
    'Réservations supprimées par un super administrateur. Conserve la ligne complète, son auteur et la date : une suppression reste explicable.';

ALTER TABLE public.deleted_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Un super admin lit les suppressions" ON public.deleted_bookings;
CREATE POLICY "Un super admin lit les suppressions"
    ON public.deleted_bookings FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

-- Aucune policy d'écriture : seule la fonction ci-dessous, en SECURITY
-- DEFINER, alimente cette table.

-- ============================================
-- 5. LE VERROU S'OUVRE, SOUS CONDITIONS
-- ============================================
-- Le trigger de supabase-protect-bookings.sql refuse toute suppression. On le
-- redéfinit pour qu'il laisse passer uniquement les suppressions déclarées par
-- `delete_booking` ci-dessous, au moyen d'un drapeau posé pour la seule durée
-- de la transaction. Une suppression tentée par un autre chemin — API, SQL
-- direct, cascade — reste refusée.

CREATE OR REPLACE FUNCTION public.prevent_booking_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(current_setting('app.booking_delete', TRUE), '') = 'authorized' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Une réservation ne peut pas être supprimée (%, le %). Utilisez le statut « annulée ».',
        OLD.client_name, OLD.booking_date
        USING ERRCODE = 'P0006';
END;
$$;

-- Si supabase-protect-bookings.sql n'a pas encore été joué, le trigger
-- n'existe pas : on le pose ici, la protection doit être en place avant
-- d'ouvrir la moindre brèche.
DROP TRIGGER IF EXISTS bookings_no_delete ON public.bookings;
CREATE TRIGGER bookings_no_delete
    BEFORE DELETE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_booking_delete();

/**
 * Supprime une réservation. Réservé au super administrateur.
 *
 * La ligne est archivée AVANT d'être effacée, dans la même transaction : si
 * l'archivage échoue, la suppression n'a pas lieu.
 */
CREATE OR REPLACE FUNCTION public.delete_booking(
    p_id     UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_email   TEXT;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Seul un super administrateur peut supprimer une réservation.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_booking FROM public.bookings WHERE id = p_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Réservation introuvable.' USING ERRCODE = 'P0002';
    END IF;

    SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();

    INSERT INTO public.deleted_bookings (id, booking, deleted_by, deleted_by_email, reason)
    VALUES (p_id, TO_JSONB(v_booking), auth.uid(), v_email, NULLIF(TRIM(p_reason), ''));

    -- Drapeau local à la transaction : il retombe de lui-même à la fin
    PERFORM set_config('app.booking_delete', 'authorized', TRUE);
    DELETE FROM public.bookings WHERE id = p_id;
    PERFORM set_config('app.booking_delete', '', TRUE);

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_booking(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_booking(UUID, TEXT) TO authenticated;

-- ============================================
-- 6. VÉRIFICATIONS
-- ============================================
-- Qui est quoi ?
--   SELECT email, role FROM public.profiles WHERE role <> 'client' ORDER BY role;
--
-- La suppression directe reste-t-elle refusée, même pour un super admin ?
--   DELETE FROM public.bookings WHERE id = '...';   -- doit lever P0006
--
-- Historique des suppressions :
--   SELECT deleted_at, deleted_by_email, reason,
--          booking->>'client_name'  AS cliente,
--          booking->>'booking_date' AS date_rdv,
--          booking->>'price_at_booking' AS montant
--   FROM public.deleted_bookings ORDER BY deleted_at DESC;
--
-- Note : le masquage des chiffres d'affaires pour le super administrateur est
-- un choix d'interface, pas une restriction de base — les fonctions
-- statistiques restent ouvertes à tout administrateur. Si ces montants doivent
-- lui être réellement inaccessibles, il faut aussi filtrer côté SQL.
