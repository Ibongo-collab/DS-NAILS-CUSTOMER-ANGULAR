# Ordre des migrations Supabase

Les scripts SQL de la racine sont à jouer **dans cet ordre**, un par un, dans
Supabase › SQL Editor.

L'ordre n'est pas une commodité : quatre fichiers redéfinissent la même
fonction `create_booking`, chacun ajoutant quelque chose au précédent. Les
jouer à l'envers ne provoque aucune erreur — la base accepte simplement une
version plus ancienne, et une fonctionnalité disparaît en silence.

## Séquence

| # | Fichier | Ce qu'il apporte |
|---|---|---|
| 1 | `supabase-schema.sql` | Tables de base : services, horaires, réservations, créneaux bloqués |
| 2 | `supabase-admin-role.sql` | `profiles`, rôle `admin`, `is_admin()`, création automatique du profil |
| 3 | `supabase-check-user-exists.sql` | Contrôle de doublon à l'inscription |
| 4 | `supabase-rate-limit.sql` | Plafond par IP sur le contrôle ci-dessus |
| 5 | `supabase-secure-bookings.sql` | Ferme la lecture publique des réservations · **`create_booking` v1** |
| 6 | `supabase-rls-cancel-booking.sql` | Annulation par la cliente |
| 7 | `supabase-booked-intervals-range.sql` | Disponibilité de plusieurs jours en une requête |
| 8 | `supabase-profile-settings.sql` | Modification du nom, de la civilité, de l'adresse |
| 9 | `supabase-service-images.sql` | Bucket des photos (5 Mo, JPG/PNG) |
| 10 | `supabase-service-categories.sql` | Catégories de prestations |
| 11 | `supabase-client-stats.sql` | Statistiques de clientèle |
| 12 | `supabase-notifications.sql` | File de notifications et rappels |
| 13 | `supabase-bookings-user-link.sql` | Colonnes `user_id` et `price_at_booking` · **`create_booking` v2** |
| 14 | `supabase-promotions.sql` | Promotions et prix remisé · **`create_booking` v3** |
| 15 | `supabase-manual-booking.sql` | Saisie manuelle d'une prestation réalisée |
| 16 | `supabase-protect-bookings.sql` | Interdit toute suppression de réservation |
| 17 | `supabase-no-overlap.sql` | Contrainte d'exclusion : deux rendez-vous ne peuvent plus se chevaucher · **`create_booking` v4** |
| 18 | `supabase-promotion-services.sql` | Une promotion peut viser plusieurs prestations (table de liaison) |
| 19 | `supabase-super-admin.sql` | Rôle `super_admin` · suppression de réservation, tracée dans `deleted_bookings` |

## Fichier obsolète

`supabase-price-at-booking.sql` — sa fonction est reprise par le nº 13. Le
rejouer rétablirait une `create_booking` sans `user_id` ni remise. Il refuse
désormais de s'exécuter si la base est à jour, et n'est conservé que comme trace
de la migration d'origine.

## Vérifier où en est la base

```sql
-- Les colonnes récentes sont-elles là ?
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings'
  AND column_name IN ('user_id', 'price_at_booking');

-- Les tables récentes ?
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('promotions', 'service_categories', 'notifications', 'profiles')
ORDER BY table_name;

-- La suppression de réservation est-elle bien verrouillée ? (nº 16)
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.bookings'::regclass AND tgname = 'bookings_no_delete';

-- create_booking tient-elle compte des remises ? (nº 14)
SELECT prosrc LIKE '%effective_price%' AS remises_prises_en_compte
FROM pg_proc WHERE proname = 'create_booking';

-- Deux rendez-vous simultanés sont-ils impossibles ? (nº 17)
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_no_overlap';

-- Qui est administrateur, qui est super administrateur ? (nº 19)
SELECT email, role FROM public.profiles WHERE role <> 'client' ORDER BY role;
```

Rejouer un script déjà passé est sans danger — sauf le fichier obsolète
ci-dessus : tous utilisent `IF NOT EXISTS`, `CREATE OR REPLACE` et
`DROP POLICY IF EXISTS`. En cas de doute sur l'ordre, reprendre la séquence
depuis le début est la manœuvre sûre.
