-- ============================================
-- INTERVALLES OCCUPÉS SUR UNE PLAGE DE DATES
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- L'écran de choix de la date doit savoir, pour chacun des 7 jours proposés,
-- s'il reste au moins un créneau libre. Interroger get_booked_intervals() jour
-- par jour ferait 7 allers-retours ; cette variante répond en une fois.
--
-- Comme sa jumelle, elle ne renvoie que des horaires : aucune donnée
-- personnelle ne sort.
--
-- Prérequis : supabase-secure-bookings.sql.

CREATE OR REPLACE FUNCTION public.get_booked_intervals_range(
    p_from DATE,
    p_to   DATE
)
RETURNS TABLE (
    booking_date DATE,
    start_time   TIME,
    end_time     TIME
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT b.booking_date, b.start_time, b.end_time
    FROM public.bookings b
    WHERE b.booking_date BETWEEN p_from AND p_to
      AND b.status IN ('pending', 'confirmed');
$$;

REVOKE EXECUTE ON FUNCTION public.get_booked_intervals_range(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booked_intervals_range(DATE, DATE) TO anon, authenticated;

-- ============================================
-- VÉRIFICATION
-- ============================================
-- Doit fonctionner sans être connecté, et ne montrer que des horaires :
--   SELECT * FROM public.get_booked_intervals_range(CURRENT_DATE, CURRENT_DATE + 6);
