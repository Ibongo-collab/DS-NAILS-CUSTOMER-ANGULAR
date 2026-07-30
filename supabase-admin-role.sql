-- ============================================
-- RÔLE ADMIN — table profiles + RLS
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Un seul système d'auth : Supabase Auth reste la source de vérité pour
-- l'identité, `public.profiles` ne porte que le rôle applicatif.

-- ============================================
-- 1. TABLE PROFILES
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT,
    full_name  TEXT,
    phone      TEXT,
    role       TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. CRÉATION AUTOMATIQUE DU PROFIL À L'INSCRIPTION
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'phone'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Rattrape les comptes déjà existants (rôle 'client' par défaut)
INSERT INTO public.profiles (id, email, full_name, phone)
SELECT
    u.id,
    u.email,
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'phone'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. FONCTION is_admin()
-- ============================================
-- SECURITY DEFINER : indispensable, sinon la lecture de `profiles` depuis une
-- policy de `profiles` déclencherait une récursion infinie de RLS.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================
-- 4. RLS SUR PROFILES
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture de son propre profil" ON public.profiles;
CREATE POLICY "Lecture de son propre profil"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS "Un admin lit tous les profils" ON public.profiles;
CREATE POLICY "Un admin lit tous les profils"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Mise à jour de son propre profil" ON public.profiles;
CREATE POLICY "Mise à jour de son propre profil"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Un admin met à jour tous les profils" ON public.profiles;
CREATE POLICY "Un admin met à jour tous les profils"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Anti-élévation de privilèges : sans ce garde-fou, la policy « Mise à jour de
-- son propre profil » laisserait n'importe quel client se passer role='admin'.
--
-- La condition `auth.uid() IS NOT NULL` réserve le blocage aux requêtes d'un
-- utilisateur connecté via l'API. Hors de ce contexte — SQL Editor, service_role,
-- migration — `auth.uid()` est NULL et le changement de rôle est autorisé : c'est
-- ce qui permet de nommer le tout premier admin (problème d'amorçage).
-- Ce n'est pas un trou : `anon` n'a aucune policy UPDATE sur `profiles`, RLS
-- rejette donc sa requête avant même que ce trigger ne s'exécute.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role
       AND auth.uid() IS NOT NULL
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur peut modifier un rôle.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_role_escalation();

-- ============================================
-- 5. POLICIES ADMIN SUR LES TABLES MÉTIER
-- ============================================
-- Les policies publiques existantes (lecture des services/horaires, création de
-- réservation) restent en place : on ajoute ici les droits d'écriture admin.

-- --- SERVICES ---
DROP POLICY IF EXISTS "Un admin voit toutes les prestations" ON public.services;
CREATE POLICY "Un admin voit toutes les prestations"
    ON public.services FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Un admin crée une prestation" ON public.services;
CREATE POLICY "Un admin crée une prestation"
    ON public.services FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin modifie une prestation" ON public.services;
CREATE POLICY "Un admin modifie une prestation"
    ON public.services FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin supprime une prestation" ON public.services;
CREATE POLICY "Un admin supprime une prestation"
    ON public.services FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- --- HORAIRES D'OUVERTURE ---
DROP POLICY IF EXISTS "Un admin crée un horaire" ON public.opening_hours;
CREATE POLICY "Un admin crée un horaire"
    ON public.opening_hours FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin modifie les horaires" ON public.opening_hours;
CREATE POLICY "Un admin modifie les horaires"
    ON public.opening_hours FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin supprime un horaire" ON public.opening_hours;
CREATE POLICY "Un admin supprime un horaire"
    ON public.opening_hours FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- --- RÉSERVATIONS ---
-- La lecture publique existe déjà (calcul des créneaux libres côté client).
DROP POLICY IF EXISTS "Un admin modifie toutes les réservations" ON public.bookings;
CREATE POLICY "Un admin modifie toutes les réservations"
    ON public.bookings FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin supprime une réservation" ON public.bookings;
CREATE POLICY "Un admin supprime une réservation"
    ON public.bookings FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- --- CRÉNEAUX BLOQUÉS ---
DROP POLICY IF EXISTS "Un admin crée un créneau bloqué" ON public.blocked_slots;
CREATE POLICY "Un admin crée un créneau bloqué"
    ON public.blocked_slots FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin modifie un créneau bloqué" ON public.blocked_slots;
CREATE POLICY "Un admin modifie un créneau bloqué"
    ON public.blocked_slots FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin supprime un créneau bloqué" ON public.blocked_slots;
CREATE POLICY "Un admin supprime un créneau bloqué"
    ON public.blocked_slots FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- ============================================
-- 6. NOMMER LE PREMIER ADMIN
-- ============================================
-- À exécuter manuellement une fois, en remplaçant l'email. Depuis le SQL Editor
-- `auth.uid()` est NULL, le trigger anti-élévation laisse donc passer.
--
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'ibongookiessi@gmail.com';
--
-- Vérification :
--   SELECT email, role FROM public.profiles ORDER BY role;
--
-- Si une version antérieure de ce script a déjà été appliquée, le trigger bloque
-- la requête ci-dessus (« Seul un administrateur peut modifier un rôle »).
-- Rejouer la section 4 suffit à le corriger ; sinon, contournement ponctuel :
--
--   ALTER TABLE public.profiles DISABLE TRIGGER profiles_prevent_role_escalation;
--   UPDATE public.profiles SET role = 'admin' WHERE email = '...';
--   ALTER TABLE public.profiles ENABLE TRIGGER profiles_prevent_role_escalation;
