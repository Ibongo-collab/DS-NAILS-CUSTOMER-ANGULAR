-- ============================================
-- CONTRÔLE D'ÉTAT DE LA BASE
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- Ne modifie rien : vérifie que chaque migration a bien pris.
-- Tout doit afficher « OK ». Rejouable autant de fois que voulu.

SELECT * FROM (

-- ---------- Structures ----------
SELECT 1 AS n, 'Rôle super_admin attribué' AS controle,
       CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 19' END AS etat
UNION ALL
SELECT 2, 'Table promotion_services',
       CASE WHEN to_regclass('public.promotion_services') IS NOT NULL
            THEN 'OK' ELSE '⚠ MANQUANT — nº 18' END
UNION ALL
SELECT 3, 'Table booking_services',
       CASE WHEN to_regclass('public.booking_services') IS NOT NULL
            THEN 'OK' ELSE '⚠ MANQUANT — nº 20' END
UNION ALL
SELECT 4, 'Colonne booking_services.fulfilled',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='booking_services'
                           AND column_name='fulfilled')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 20' END
UNION ALL
SELECT 5, 'Table deleted_bookings (archive)',
       CASE WHEN to_regclass('public.deleted_bookings') IS NOT NULL
            THEN 'OK' ELSE '⚠ MANQUANT — nº 19' END

-- ---------- Garde-fous ----------
UNION ALL
SELECT 6, 'Suppression de réservation interdite',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgrelid='public.bookings'::regclass AND tgname='bookings_no_delete')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 16' END
UNION ALL
SELECT 7, 'Deux rendez-vous ne peuvent se chevaucher',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conrelid='public.bookings'::regclass AND conname='bookings_no_overlap')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 17' END
UNION ALL
SELECT 8, 'Prestation unique par rendez-vous',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname='public' AND indexname='unique_service_per_booking')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 20' END

-- ---------- Fonctions ----------
UNION ALL
SELECT 9, 'create_booking accepte plusieurs prestations',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
              WHERE ns.nspname='public' AND p.proname='create_booking'
                AND pg_get_function_identity_arguments(p.oid) LIKE 'uuid[]%')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 20' END
UNION ALL
SELECT 10, 'Ancienne create_booking retirée',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
              WHERE ns.nspname='public' AND p.proname='create_booking'
                AND pg_get_function_identity_arguments(p.oid) LIKE 'uuid,%')
            THEN 'OK' ELSE '⚠ DOUBLON — rejouer nº 20' END
UNION ALL
SELECT 11, 'create_booking applique les remises',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='create_booking'
                           AND prosrc LIKE '%effective_price%')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 14' END
UNION ALL
SELECT 12, 'complete_booking (clôture partielle)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='complete_booking')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 20' END
UNION ALL
SELECT 13, 'delete_booking (super admin)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='delete_booking')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 19' END
UNION ALL
SELECT 14, 'save_promotion (plusieurs prestations)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='save_promotion')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 18' END
UNION ALL
SELECT 15, 'create_manual_booking accepte un montant',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
              WHERE ns.nspname='public' AND p.proname='create_manual_booking'
                AND pg_get_function_identity_arguments(p.oid) LIKE '%numeric')
            THEN 'OK' ELSE '⚠ À REJOUER — supabase-manual-booking.sql' END
UNION ALL
SELECT 16, 'total_duration',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='total_duration')
            THEN 'OK' ELSE '⚠ MANQUANT — nº 20' END

-- ---------- Cohérence des données ----------
UNION ALL
SELECT 17, 'Chaque réservation a ses prestations',
       CASE WHEN (SELECT COUNT(*) FROM public.bookings b
                  WHERE NOT EXISTS (SELECT 1 FROM public.booking_services bs
                                    WHERE bs.booking_id = b.id)) = 0
            THEN 'OK'
            ELSE '⚠ ' || (SELECT COUNT(*)::TEXT FROM public.bookings b
                          WHERE NOT EXISTS (SELECT 1 FROM public.booking_services bs
                                            WHERE bs.booking_id = b.id))
                 || ' sans ligne — rejouer nº 20' END
UNION ALL
SELECT 18, 'Prestations sans contact (hors classement fidélité)',
       CASE WHEN (SELECT COUNT(*) FROM public.bookings
                  WHERE status='completed'
                    AND COALESCE(TRIM(client_phone),'')=''
                    AND COALESCE(TRIM(client_email),'')='') = 0
            THEN 'OK'
            ELSE '⚠ ' || (SELECT COUNT(*)::TEXT FROM public.bookings
                          WHERE status='completed'
                            AND COALESCE(TRIM(client_phone),'')=''
                            AND COALESCE(TRIM(client_email),'')='')
                 || ' à compléter (voir supabase-manual-booking.sql § 2)' END

) AS controles ORDER BY n;
