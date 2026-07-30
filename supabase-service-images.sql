-- ============================================
-- IMAGES DES PRESTATIONS
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Remplace les pictogrammes par de vraies photos, téléversées depuis l'admin.
--
-- Prérequis : supabase-admin-role.sql (fournit public.is_admin()).

-- ============================================
-- 1. COLONNE
-- ============================================

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.services.image_url IS
    'URL publique de la photo de la prestation, dans le bucket service-images.';

-- ============================================
-- 2. BUCKET DE STOCKAGE
-- ============================================
-- `file_size_limit` et `allowed_mime_types` sont la vraie barrière : le
-- contrôle fait dans le navigateur ne protège que l'utilisateur honnête,
-- il se contourne trivialement. Le serveur refuse ici tout dépassement.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'service-images',
    'service-images',
    TRUE,                                                   -- lecture publique
    5242880,                                                -- 5 Mo
    -- JPG et PNG uniquement : formats lus par tous les navigateurs et par les
    -- clients de messagerie, sans surprise d'affichage.
    ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================
-- 3. DROITS SUR LES FICHIERS
-- ============================================
-- Lecture ouverte à tous (les photos s'affichent sur le site public),
-- écriture réservée aux administrateurs.

DROP POLICY IF EXISTS "Photos de prestations visibles par tous" ON storage.objects;
CREATE POLICY "Photos de prestations visibles par tous"
    ON storage.objects FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'service-images');

DROP POLICY IF EXISTS "Un admin téléverse une photo de prestation" ON storage.objects;
CREATE POLICY "Un admin téléverse une photo de prestation"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'service-images' AND public.is_admin());

DROP POLICY IF EXISTS "Un admin remplace une photo de prestation" ON storage.objects;
CREATE POLICY "Un admin remplace une photo de prestation"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'service-images' AND public.is_admin())
    WITH CHECK (bucket_id = 'service-images' AND public.is_admin());

DROP POLICY IF EXISTS "Un admin supprime une photo de prestation" ON storage.objects;
CREATE POLICY "Un admin supprime une photo de prestation"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'service-images' AND public.is_admin());

-- ============================================
-- 4. VÉRIFICATIONS
-- ============================================
-- Le bucket est-il bien configuré ?
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'service-images';
--
-- Prestations encore sans photo :
--   SELECT name, image_url FROM public.services ORDER BY name;
--
-- Note : la colonne `icon` reste en base mais n'est plus affichée. Elle pourra
-- être supprimée une fois toutes les prestations pourvues d'une photo :
--   ALTER TABLE public.services DROP COLUMN icon;
