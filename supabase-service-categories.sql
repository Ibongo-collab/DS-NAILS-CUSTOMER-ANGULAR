-- ============================================
-- CATÉGORIES DE PRESTATIONS
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Prérequis : supabase-admin-role.sql (public.is_admin()).

-- ============================================
-- 1. TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.service_categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deux catégories homonymes rendraient l'affectation ambiguë.
-- L'index est insensible à la casse : « Onglerie » et « onglerie » sont une seule.
CREATE UNIQUE INDEX IF NOT EXISTS unique_category_name
    ON public.service_categories (lower(name));

-- ============================================
-- 2. RATTACHEMENT DES PRESTATIONS
-- ============================================
-- ON DELETE SET NULL : supprimer une catégorie ne doit jamais emporter les
-- prestations qu'elle contient. Elles redeviennent simplement sans catégorie.

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES public.service_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category_id);

COMMENT ON COLUMN public.services.category_id IS
    'Catégorie de la prestation. NULL = non classée.';

-- ============================================
-- 3. DROITS
-- ============================================
-- Lecture publique : le site client pourra regrouper les prestations par
-- catégorie. Écriture réservée aux administrateurs.

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Les catégories sont visibles par tous" ON public.service_categories;
CREATE POLICY "Les catégories sont visibles par tous"
    ON public.service_categories FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Un admin crée une catégorie" ON public.service_categories;
CREATE POLICY "Un admin crée une catégorie"
    ON public.service_categories FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin modifie une catégorie" ON public.service_categories;
CREATE POLICY "Un admin modifie une catégorie"
    ON public.service_categories FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin supprime une catégorie" ON public.service_categories;
CREATE POLICY "Un admin supprime une catégorie"
    ON public.service_categories FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- ============================================
-- 4. VÉRIFICATIONS
-- ============================================
-- Catégories et nombre de prestations rattachées :
--   SELECT c.name, COUNT(s.id) AS prestations
--   FROM public.service_categories c
--   LEFT JOIN public.services s ON s.category_id = c.id
--   GROUP BY c.name ORDER BY c.name;
--
-- Prestations non classées :
--   SELECT name FROM public.services WHERE category_id IS NULL ORDER BY name;
