-- Politique RLS : permet à un utilisateur connecté d'annuler uniquement ses propres réservations.
-- À exécuter dans l'éditeur SQL de votre projet Supabase.

-- Active RLS sur la table bookings si ce n'est pas déjà fait
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Permet à un utilisateur authentifié de mettre à jour ses propres réservations
-- (identifié par son email Supabase Auth = client_email dans la table)
CREATE POLICY "Authenticated users can cancel their own bookings"
ON bookings
FOR UPDATE
TO authenticated
USING (client_email = auth.email())
WITH CHECK (client_email = auth.email());

-- Permet à tout le monde (y compris anon) de lire les réservations
-- (nécessaire pour les vérifications de disponibilité côté client)
CREATE POLICY "Anyone can read bookings"
ON bookings
FOR SELECT
TO anon, authenticated
USING (true);

-- Permet à tout le monde d'insérer une réservation (réservation en tant qu'invité)
CREATE POLICY "Anyone can insert a booking"
ON bookings
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
