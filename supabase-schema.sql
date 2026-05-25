-- ============================================
-- SCHÉMA BASE DE DONNÉES SUPABASE
-- Salon de Beauté - Système de Réservation
-- ============================================

-- 1. TABLE DES SERVICES
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    icon TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Données initiales des services
INSERT INTO services (name, description, duration_minutes, price, icon) VALUES
    ('Manucure Classique', 'Soin complet des mains avec pose de vernis', 45, 250.00, '💅'),
    ('Manucure Gel/Semi-permanent', 'Pose de vernis gel longue durée', 60, 350.00, '💅'),
    ('Pédicure Complète', 'Soin complet des pieds avec pose de vernis', 60, 350.00, '🦶'),
    ('Coupe + Brushing', 'Coupe de cheveux et mise en forme', 90, 450.00, '✂️'),
    ('Manucure + Pédicure', 'Forfait combiné mains et pieds', 120, 550.00, '💅🦶');

-- 2. TABLE DES HORAIRES D'OUVERTURE
CREATE TABLE opening_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week INTEGER NOT NULL, -- 1=Lundi, 7=Dimanche
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(day_of_week)
);

-- Horaires par défaut (Lundi-Vendredi: 9h-18h, Samedi: 9h-17h, Dimanche: Fermé)
INSERT INTO opening_hours (day_of_week, start_time, end_time, is_closed) VALUES
    (1, '09:00', '18:00', false), -- Lundi
    (2, '09:00', '18:00', false), -- Mardi
    (3, '09:00', '18:00', false), -- Mercredi
    (4, '09:00', '18:00', false), -- Jeudi
    (5, '09:00', '18:00', false), -- Vendredi
    (6, '09:00', '17:00', false), -- Samedi
    (7, '10:00', '16:00', true);  -- Dimanche (fermé)

-- 3. TABLE DES RÉSERVATIONS
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    client_email TEXT NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'completed'
    whatsapp_notification BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '10 minutes'
);

-- Index pour améliorer les performances
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_date_time ON bookings(booking_date, start_time);

-- Contrainte unique pour éviter les doubles réservations
CREATE UNIQUE INDEX unique_booking_slot 
ON bookings (booking_date, start_time) 
WHERE status IN ('pending', 'confirmed');

-- 4. TABLE DES CRÉNEAUX BLOQUÉS (vacances, maintenance, etc.)
CREATE TABLE blocked_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les créneaux bloqués
CREATE INDEX idx_blocked_slots_date ON blocked_slots(date);

-- ============================================
-- FONCTIONS ET TRIGGERS
-- ============================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour bookings
CREATE TRIGGER update_bookings_updated_at 
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour nettoyer les réservations expirées (à exécuter via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_bookings()
RETURNS void AS $$
BEGIN
    DELETE FROM bookings 
    WHERE status = 'pending' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Activer RLS sur les tables
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;

-- Politiques pour les services (lecture publique)
CREATE POLICY "Les services sont visibles par tous"
    ON services FOR SELECT
    USING (active = true);

-- Politiques pour les horaires d'ouverture (lecture publique)
CREATE POLICY "Les horaires sont visibles par tous"
    ON opening_hours FOR SELECT
    USING (true);

-- Politiques pour les réservations
CREATE POLICY "Création de réservation publique"
    ON bookings FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Lecture des réservations confirmées"
    ON bookings FOR SELECT
    USING (status IN ('confirmed', 'pending'));

-- Politiques pour les créneaux bloqués (lecture publique)
CREATE POLICY "Les créneaux bloqués sont visibles par tous"
    ON blocked_slots FOR SELECT
    USING (true);

-- ============================================
-- VUES UTILES
-- ============================================

-- Vue pour les statistiques quotidiennes
CREATE VIEW daily_bookings_stats AS
SELECT 
    booking_date,
    COUNT(*) as total_bookings,
    COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_bookings,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_bookings,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_bookings,
    SUM(s.price) FILTER (WHERE status = 'confirmed') as revenue
FROM bookings b
JOIN services s ON b.service_id = s.id
GROUP BY booking_date
ORDER BY booking_date DESC;

-- ============================================
-- CONFIGURATION TEMPS RÉEL
-- ============================================

-- Activer les réplications en temps réel pour Supabase
-- (À faire via l'interface Supabase: Database > Replication)
-- Activer la réplication pour la table 'bookings'

-- ============================================
-- NOTES D'UTILISATION
-- ============================================

/*
1. CONNEXION À SUPABASE:
   - Allez sur https://app.supabase.com
   - Créez un nouveau projet
   - Copiez l'URL et la clé anon dans votre fichier environment.ts
   
2. EXÉCUTER CE SCRIPT:
   - Dans Supabase Dashboard > SQL Editor
   - Collez tout ce script
   - Cliquez sur "Run"
   
3. ACTIVER LE TEMPS RÉEL:
   - Database > Replication
   - Activez la réplication pour la table 'bookings'
   
4. CONFIGURER UN CRON (optionnel):
   - Pour nettoyer les réservations expirées automatiquement
   - Edge Functions > Create new function
   - Exécuter: SELECT cleanup_expired_bookings();
   - Planifier toutes les 5 minutes
   
5. TESTER LES DONNÉES:
   - Table Editor > bookings
   - Vous devriez voir les données initiales
*/
