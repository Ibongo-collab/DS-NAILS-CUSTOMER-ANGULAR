-- ============================================
-- STATISTIQUES ET ANNUAIRE CLIENTS
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- `public.profiles` est le registre de référence de la clientèle : c'est lui
-- qui porte le rôle (client / admin). Les deux fonctions ci-dessous partent
-- donc de cette table.
--
-- `auth.users` reste jointe pour une seule information, qui n'existe nulle part
-- ailleurs : `email_confirmed_at`, le statut de confirmation de l'adresse.
--
-- Prérequis : supabase-admin-role.sql (fournit public.profiles et is_admin()).

-- ============================================
-- 1. CORRECTION DES DATES D'INSCRIPTION
-- ============================================
-- Le backfill de supabase-admin-role.sql ne recopiait pas `created_at` : les
-- comptes existants avant cette migration ont donc reçu la date d'exécution du
-- script, et non leur vraie date d'inscription.
--
-- Sans cette correction, la courbe de croissance montrerait toute la clientèle
-- historique apparaissant d'un coup le jour de la migration.

UPDATE public.profiles p
SET created_at = u.created_at
FROM auth.users u
WHERE u.id = p.id
  AND p.created_at IS DISTINCT FROM u.created_at;

-- ============================================
-- 2. INSCRIPTIONS AGRÉGÉES PAR DATE
-- ============================================
-- Ne renvoie que des dates et des compteurs, aucune donnée personnelle.
--
-- Même précaution que pour get_clients() : on repart d'un DROP pour que le
-- fichier reste rejouable même si la signature évolue un jour.

DROP FUNCTION IF EXISTS public.get_client_signups();

CREATE FUNCTION public.get_client_signups()
RETURNS TABLE (
    signup_date      DATE,
    verified_count   INTEGER,
    unverified_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    -- SECURITY DEFINER contourne RLS : le contrôle de rôle doit être explicite ici.
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        p.created_at::DATE,
        COUNT(*) FILTER (WHERE u.email_confirmed_at IS NOT NULL)::INTEGER,
        COUNT(*) FILTER (WHERE u.email_confirmed_at IS NULL)::INTEGER
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'client'
    GROUP BY p.created_at::DATE
    ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_client_signups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_signups() TO authenticated;

-- ============================================
-- 3. LISTE NOMINATIVE DES CLIENTS
-- ============================================
-- Celle-ci renvoie des données personnelles : strictement réservée aux admins.
--
-- DROP préalable obligatoire : `CREATE OR REPLACE` refuse de modifier le type
-- de retour d'une fonction existante, et cette version ajoute la colonne
-- `gender`. Les droits sont reposés juste après le CREATE.

DROP FUNCTION IF EXISTS public.get_clients();

CREATE FUNCTION public.get_clients()
RETURNS TABLE (
    client_id      UUID,
    full_name      TEXT,
    email          TEXT,
    phone          TEXT,
    gender         TEXT,
    signed_up_at   TIMESTAMPTZ,
    email_verified BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name'),
        COALESCE(p.email, u.email::TEXT),
        COALESCE(p.phone, u.raw_user_meta_data ->> 'phone'),
        COALESCE(p.gender, NULLIF(u.raw_user_meta_data ->> 'gender', '')),
        p.created_at,
        (u.email_confirmed_at IS NOT NULL)
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'client'
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clients() TO authenticated;

-- ============================================
-- 4. VÉRIFICATIONS
-- ============================================
-- Depuis le SQL Editor, auth.uid() est NULL donc is_admin() renvoie false :
-- l'appel des fonctions lèvera « Réservé aux administrateurs ». C'est attendu ;
-- le test réel se fait depuis l'application, connecté en admin.
--
-- Contrôle équivalent, exécutable directement dans l'éditeur :
--   SELECT COUNT(*) FILTER (WHERE u.email_confirmed_at IS NOT NULL) AS verifies,
--          COUNT(*) FILTER (WHERE u.email_confirmed_at IS NULL)     AS en_attente
--   FROM public.profiles p
--   LEFT JOIN auth.users u ON u.id = p.id
--   WHERE p.role = 'client';
--
-- Qui est écarté du comptage :
--   SELECT email, role FROM public.profiles WHERE role = 'admin';
--
-- ⚠ Comptes présents dans auth.users mais absents de profiles : ils
-- n'apparaîtront NI dans le compteur NI dans la liste, puisque tout part
-- désormais de `profiles`. Doit renvoyer 0 ligne ; sinon le trigger
-- on_auth_user_created est en défaut et il faut rejouer le backfill de
-- supabase-admin-role.sql.
--   SELECT u.id, u.email, u.created_at
--   FROM auth.users u
--   LEFT JOIN public.profiles p ON p.id = u.id
--   WHERE p.id IS NULL;
