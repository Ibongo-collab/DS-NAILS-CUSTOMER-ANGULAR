-- ============================================
-- PARAMÈTRES DU COMPTE : civilité, nom, email
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Principe retenu : `auth.users` reste la source de vérité (identité + méta-
-- données), `public.profiles` en est un miroir tenu à jour par trigger. Le
-- front n'écrit donc qu'à un seul endroit — auth.updateUser() — et n'a jamais
-- à maintenir les deux tables cohérentes lui-même.
--
-- Prérequis : supabase-admin-role.sql.

-- ============================================
-- 1. CIVILITÉ
-- ============================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS gender TEXT;

-- Contrainte posée à part : ADD COLUMN IF NOT EXISTS ne rejoue pas le CHECK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_gender_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_gender_check
            CHECK (gender IS NULL OR gender IN ('homme', 'femme'));
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.gender IS
    'Civilité déclarée à l''inscription. NULL pour les comptes antérieurs.';

-- ============================================
-- 2. CRÉATION DU PROFIL (ajout de la civilité)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone, gender)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'phone',
        NULLIF(NEW.raw_user_meta_data ->> 'gender', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- ============================================
-- 3. SYNCHRONISATION DES MODIFICATIONS
-- ============================================
-- Répercute dans `profiles` tout changement fait sur le compte : nom, civilité,
-- téléphone, et surtout l'email — qui ne change dans auth.users QU'APRÈS que
-- l'utilisateur a cliqué le lien de confirmation. Sans ce trigger, `profiles`
-- garderait l'ancienne adresse indéfiniment.

CREATE OR REPLACE FUNCTION public.handle_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles p
    SET email      = NEW.email,
        full_name  = COALESCE(NEW.raw_user_meta_data ->> 'full_name', p.full_name),
        phone      = COALESCE(NEW.raw_user_meta_data ->> 'phone', p.phone),
        gender     = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'gender', ''), p.gender),
        updated_at = NOW()
    WHERE p.id = NEW.id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_updated();

-- Remise à niveau des profils déjà désynchronisés
UPDATE public.profiles p
SET email     = u.email,
    full_name = COALESCE(u.raw_user_meta_data ->> 'full_name', p.full_name),
    phone     = COALESCE(u.raw_user_meta_data ->> 'phone', p.phone),
    gender    = COALESCE(NULLIF(u.raw_user_meta_data ->> 'gender', ''), p.gender)
FROM auth.users u
WHERE u.id = p.id
  AND (
        p.email IS DISTINCT FROM u.email
     OR p.full_name IS DISTINCT FROM COALESCE(u.raw_user_meta_data ->> 'full_name', p.full_name)
  );

-- ============================================
-- 4. VÉRIFICATIONS
-- ============================================
-- Profils désynchronisés de auth.users (doit renvoyer 0 ligne) :
--   SELECT p.id, p.email AS profil, u.email AS compte
--   FROM public.profiles p JOIN auth.users u ON u.id = p.id
--   WHERE p.email IS DISTINCT FROM u.email;
--
-- Répartition des civilités :
--   SELECT COALESCE(gender, 'non renseigné') AS civilite, COUNT(*)
--   FROM public.profiles GROUP BY 1;
--
-- ⚠ RÉGLAGE À VÉRIFIER DANS LE DASHBOARD
-- Authentication > Providers > Email > « Secure email change »
--   activé  : un lien part vers l'ANCIENNE et la NOUVELLE adresse, les deux
--             doivent être cliqués. C'est le réglage recommandé, et le message
--             affiché par l'application correspond à ce cas.
--   désactivé : seule la nouvelle adresse reçoit un lien.
