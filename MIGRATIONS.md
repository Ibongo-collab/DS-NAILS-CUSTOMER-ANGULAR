# Ordre des migrations Supabase

Les scripts SQL de la racine sont à jouer **dans cet ordre**, un par un, dans
Supabase › SQL Editor.

L'ordre n'est pas une commodité : cinq fichiers redéfinissent la même fonction
`create_booking`, chacun ajoutant quelque chose au précédent. Les jouer à
l'envers ne provoque aucune erreur — la base accepte simplement une version
plus ancienne, et une fonctionnalité disparaît en silence.

👉 Après exécution, **`supabase-verification.sql`** contrôle en une requête que
tout a bien pris. Il ne modifie rien et se rejoue autant de fois que voulu.

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
| 16 | `supabase-protect-bookings.sql` | Interdit toute suppression de réservation |
| 17 | `supabase-no-overlap.sql` | Contrainte d'exclusion : deux rendez-vous ne peuvent plus se chevaucher · **`create_booking` v4** |
| 18 | `supabase-promotion-services.sql` | Une promotion peut viser plusieurs prestations (table de liaison) |
| 19 | `supabase-super-admin.sql` | Rôle `super_admin` · suppression de réservation, tracée dans `deleted_bookings` |
| 20 | `supabase-multi-service-booking.sql` | Plusieurs prestations sur un même rendez-vous · **`create_booking` v5** |
| 21 | `supabase-manual-booking.sql` | Saisie manuelle d'une prestation réalisée, à une ou plusieurs prestations. **Après le nº 20** : il alimente `booking_services` |

> Le nº 15 est vacant : `supabase-manual-booking.sql` l'occupait, il a été
> déplacé en nº 21 le jour où il s'est mis à écrire dans `booking_services`.
> Les numéros n'ont pas été redistribués, pour que les renvois d'un fichier à
> l'autre restent valables.

## Fichier obsolète

`supabase-price-at-booking.sql` — sa fonction est reprise par le nº 13. Le
rejouer rétablirait une `create_booking` sans `user_id` ni remise. Il refuse
désormais de s'exécuter si la base est à jour, et n'est conservé que comme trace
de la migration d'origine.

## Fonctions redéfinies d'un fichier à l'autre

Une même fonction porte plusieurs versions au fil des migrations. Seule la
dernière compte — d'où l'importance de l'ordre.

| Fonction | Dernière version | Ce qu'elle sait faire |
|---|---|---|
| `create_booking` | nº 20 | Plusieurs prestations, remises, refus des créneaux chevauchants |
| `create_manual_booking` | nº 21 | Plusieurs prestations, montant encaissé libre, téléphone obligatoire |
| `active_discount` | nº 18 | Promotion visant plusieurs prestations |
| `is_admin` | nº 19 | Reconnaît aussi le super administrateur |
| `prevent_role_escalation` | nº 19 | Le rôle suprême ne s'accorde qu'entre pairs |
| `prevent_booking_delete` | nº 19 | Laisse passer la seule suppression déclarée par `delete_booking` |

## Vérifier où en est la base

Le plus simple : exécuter **`supabase-verification.sql`**, qui déroule
18 contrôles et attend « OK » partout. Les requêtes ci-dessous en reprennent
les principales, si vous préférez les jouer une par une.

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

-- Chaque réservation a-t-elle ses prestations ? (nº 20 — attendu : 0)
SELECT COUNT(*) AS sans_ligne FROM public.bookings b
WHERE NOT EXISTS (SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = b.id);

-- La saisie manuelle accepte-t-elle plusieurs prestations ? (nº 21)
SELECT pg_get_function_identity_arguments(p.oid) LIKE 'uuid[]%' AS multi_prestations
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_manual_booking';
```

Rejouer un script déjà passé est sans danger — sauf le fichier obsolète
ci-dessus : tous utilisent `IF NOT EXISTS`, `CREATE OR REPLACE` et
`DROP POLICY IF EXISTS`. En cas de doute sur l'ordre, reprendre la séquence
depuis le début est la manœuvre sûre.
