-- ============================================
-- UNE PROMOTION PEUT VISER PLUSIEURS PRESTATIONS
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Jusqu'ici une promotion portait une seule colonne `service_id` : soit une
-- prestation, soit NULL pour toutes. Impossible d'en viser trois sur dix.
--
-- On passe à une table de liaison. La règle de portée devient :
--
--   aucune ligne de liaison  →  la promotion s'applique à TOUTES les prestations
--   une ou plusieurs lignes  →  elle ne s'applique qu'à celles-là
--
-- Prérequis : supabase-promotions.sql.

-- ============================================
-- 0. GARDE-FOU
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'promotions'
    ) THEN
        RAISE EXCEPTION
            'La table promotions n''existe pas. Exécutez d''abord supabase-promotions.sql (voir MIGRATIONS.md).';
    END IF;
END $$;

-- ============================================
-- 1. TABLE DE LIAISON
-- ============================================

CREATE TABLE IF NOT EXISTS public.promotion_services (
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    service_id   UUID NOT NULL REFERENCES public.services(id)   ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, service_id)
);

COMMENT ON TABLE public.promotion_services IS
    'Prestations visées par une promotion. Aucune ligne pour une promotion donnée = elle s''applique à toutes.';

CREATE INDEX IF NOT EXISTS idx_promotion_services_service
    ON public.promotion_services(service_id);

-- ============================================
-- 2. REPRISE DE L'EXISTANT
-- ============================================
-- Chaque promotion déjà ciblée sur une prestation reçoit sa ligne de liaison.
-- Celles qui visaient toutes les prestations (`service_id IS NULL`) n'en
-- reçoivent aucune : c'est exactement la nouvelle convention.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'promotions'
          AND column_name = 'service_id'
    ) THEN
        INSERT INTO public.promotion_services (promotion_id, service_id)
        SELECT id, service_id FROM public.promotions WHERE service_id IS NOT NULL
        ON CONFLICT DO NOTHING;

        -- La colonne disparaît : deux sources de vérité pour la même règle
        -- finiraient forcément par diverger.
        ALTER TABLE public.promotions DROP COLUMN service_id;
    END IF;
END $$;

-- ============================================
-- 3. DROITS
-- ============================================
-- Lecture publique : le site doit savoir quelles prestations sont remisées.
-- Écriture réservée aux administrateurs.

ALTER TABLE public.promotion_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Les prestations en promotion sont visibles par tous" ON public.promotion_services;
CREATE POLICY "Les prestations en promotion sont visibles par tous"
    ON public.promotion_services FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Un admin rattache une prestation" ON public.promotion_services;
CREATE POLICY "Un admin rattache une prestation"
    ON public.promotion_services FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Un admin détache une prestation" ON public.promotion_services;
CREATE POLICY "Un admin détache une prestation"
    ON public.promotion_services FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- ============================================
-- 4. LA REMISE APPLICABLE TIENT COMPTE DE LA LIAISON
-- ============================================
-- Règle inchangée par ailleurs : en cas de promotions qui se chevauchent,
-- c'est la PLUS FORTE qui l'emporte, jamais la somme.

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
      AND (
          -- Aucune prestation rattachée : la promotion vaut pour toutes
          NOT EXISTS (
              SELECT 1 FROM public.promotion_services ps
              WHERE ps.promotion_id = p.id
          )
          OR EXISTS (
              SELECT 1 FROM public.promotion_services ps
              WHERE ps.promotion_id = p.id AND ps.service_id = p_service_id
          )
      );
$$;

REVOKE EXECUTE ON FUNCTION public.active_discount(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_discount(UUID, DATE) TO anon, authenticated;

-- ============================================
-- 5. ENREGISTREMENT EN UNE SEULE OPÉRATION
-- ============================================
-- Créer la promotion puis rattacher les prestations en deux appels laisserait,
-- si le second échoue, une promotion dont la portée est fausse — donc des prix
-- faux. Une seule fonction, une seule transaction.

CREATE OR REPLACE FUNCTION public.save_promotion(
    p_name             TEXT,
    p_discount_percent NUMERIC,
    p_starts_on        DATE,
    p_ends_on          DATE,
    p_service_ids      UUID[] DEFAULT NULL,
    p_id               UUID   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur peut modifier une promotion.'
            USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(TRIM(p_name), '') = '' THEN
        RAISE EXCEPTION 'Donnez un nom à la promotion.' USING ERRCODE = 'P0003';
    END IF;

    IF p_discount_percent IS NULL OR p_discount_percent <= 0 OR p_discount_percent > 100 THEN
        RAISE EXCEPTION 'La remise doit être comprise entre 1 et 100 %%.' USING ERRCODE = 'P0003';
    END IF;

    IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on THEN
        RAISE EXCEPTION 'La date de fin doit être postérieure à la date de début.'
            USING ERRCODE = 'P0003';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.promotions (name, discount_percent, starts_on, ends_on)
        VALUES (TRIM(p_name), p_discount_percent, p_starts_on, p_ends_on)
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.promotions
        SET name = TRIM(p_name),
            discount_percent = p_discount_percent,
            starts_on = p_starts_on,
            ends_on = p_ends_on
        WHERE id = p_id
        RETURNING id INTO v_id;

        IF v_id IS NULL THEN
            RAISE EXCEPTION 'Promotion introuvable.' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- La portée est remplacée en entier : c'est ce que l'écran envoie, et cela
    -- évite d'avoir à calculer un écart entre l'ancien et le nouveau.
    DELETE FROM public.promotion_services WHERE promotion_id = v_id;

    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        INSERT INTO public.promotion_services (promotion_id, service_id)
        SELECT v_id, UNNEST(p_service_ids)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_promotion(TEXT, NUMERIC, DATE, DATE, UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_promotion(TEXT, NUMERIC, DATE, DATE, UUID[], UUID) TO authenticated;

-- ============================================
-- 6. VÉRIFICATIONS
-- ============================================
-- Portée de chaque promotion :
--   SELECT p.name, p.discount_percent,
--          COALESCE(
--            NULLIF(STRING_AGG(s.name, ', ' ORDER BY s.name), ''),
--            'Toutes les prestations'
--          ) AS portee
--   FROM public.promotions p
--   LEFT JOIN public.promotion_services ps ON ps.promotion_id = p.id
--   LEFT JOIN public.services s ON s.id = ps.service_id
--   GROUP BY p.id, p.name, p.discount_percent
--   ORDER BY p.starts_on DESC;
--
-- Effet sur les prix, prestation par prestation :
--   SELECT s.name, s.price AS prix_public,
--          public.active_discount(s.id) AS remise,
--          public.effective_price(s.id) AS prix_du
--   FROM public.services s WHERE s.active ORDER BY s.name;
