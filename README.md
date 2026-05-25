# 💅 Salon Belle Beauté - Système de Réservation

Application de réservation en ligne pour salon de beauté développée avec **Angular 20** et **Supabase**.

## ✨ Fonctionnalités

- 📅 Réservation en ligne en 4 étapes simples
- 🔄 **Mise à jour en temps réel** des créneaux disponibles
- 📱 Interface mobile-first responsive
- 💅 Gestion des services (manucure, pédicure, coiffure)
- ⏰ Gestion intelligente des créneaux horaires
- 🔒 Protection contre les doubles réservations
- 📧 Système de notifications (Email + WhatsApp)

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18+ et npm
- Compte Supabase (gratuit)

### Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer Supabase (voir section ci-dessous)

# 3. Lancer l'application
ng serve

# L'application sera accessible sur http://localhost:4200
```

## 🗄️ Configuration Supabase

### Étape 1: Créer un projet Supabase

1. Allez sur [https://app.supabase.com](https://app.supabase.com)
2. Créez un nouveau projet (gratuit)
3. Attendez que le projet soit prêt (~2 minutes)

### Étape 2: Configurer la base de données

1. Dans Supabase, allez dans **Database > SQL Editor**
2. Cliquez sur **New query**
3. Copiez le contenu complet du fichier `supabase-schema.sql`
4. Collez-le dans l'éditeur SQL
5. Cliquez sur **Run** (ou F5)
6. Vous devriez voir: "Success. No rows returned"

✅ Votre base de données est maintenant configurée avec :
- Les tables (services, bookings, opening_hours, blocked_slots)
- Les données initiales (5 services prêts à l'emploi)
- Les contraintes de sécurité
- Les index pour les performances

### Étape 3: Récupérer les clés API

1. Dans Supabase, allez dans **Settings > API**
2. Copiez :
   - **Project URL** (ex: https://xxxxx.supabase.co)
   - **anon public** key (la clé publique)

### Étape 4: Configurer l'application

Ouvrez le fichier `src/environments/environment.development.ts` et remplacez :

```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'https://xxxxx.supabase.co', // ← Votre Project URL
    anonKey: 'eyJhbGc...'              // ← Votre anon key
  }
};
```

### Étape 5: Activer le temps réel

1. Dans Supabase, allez dans **Database > Replication**
2. Trouvez la table **bookings**
3. Activez le toggle **Enable replication**
4. Cliquez sur **Save**

✅ Le temps réel est maintenant activé ! Les créneaux se mettront à jour automatiquement.

## 📱 Structure de l'application

```
src/app/
├── components/
│   ├── home/                    # Page d'accueil
│   ├── service-selection/       # Choix du service
│   ├── date-selection/          # Choix de la date
│   ├── time-selection/          # Choix du créneau (+ temps réel)
│   ├── client-form/             # Formulaire client
│   └── confirmation/            # Confirmation de réservation
├── services/
│   ├── supabase.service.ts      # Service Supabase de base
│   └── booking.service.ts       # Logique métier des réservations
├── models/
│   └── booking.model.ts         # Interfaces TypeScript
└── app.routes.ts                # Configuration des routes
```

## 🔄 Comment fonctionne le temps réel ?

### Architecture

```
Client 1 réserve 14h00
        ↓
    Supabase DB
        ↓
   Event broadcast
        ↓
Client 2 (WebSocket) ← Reçoit la notification
        ↓
Recharge les créneaux
        ↓
14h00 disparaît automatiquement
```

### Dans le code

```typescript
// Le composant time-selection s'abonne aux changements
this.bookingService.subscribeToBookings(date, () => {
  // Callback appelé automatiquement quand une réservation change
  this.loadTimeSlots(); // Recharge les créneaux
});
```

## 🎨 Parcours utilisateur

### Interface Client

1. **Page d'accueil** → Présentation du salon
2. **Sélection du service** → Choisir manucure, pédicure, coiffure, etc.
3. **Sélection de la date** → 7 prochains jours disponibles
4. **Sélection de l'horaire** → Créneaux disponibles (mise à jour en temps réel)
5. **Formulaire client** → Nom, téléphone, email, option WhatsApp
6. **Confirmation** → Récapitulatif complet de la réservation

### Prévention des doubles réservations

Le système utilise plusieurs mécanismes :

1. **Contrainte unique en base** : Impossible d'insérer 2 réservations au même créneau
2. **Status 'pending'** : Verrouillage temporaire de 10 minutes
3. **Temps réel** : Les créneaux se grisant immédiatement pour tous les utilisateurs
4. **Cache intelligent** : Rafraîchissement automatique toutes les 30 secondes

## 📊 Gestion des données

### Table Services

```sql
services
- id (uuid)
- name (text) - "Manucure Classique"
- duration_minutes (int) - 45
- price (decimal) - 250.00
- icon (text) - "💅"
- active (boolean)
```

### Table Bookings

```sql
bookings
- id (uuid)
- service_id (uuid)
- client_name (text)
- client_phone (text)
- client_email (text)
- booking_date (date)
- start_time (time)
- end_time (time)
- status (text) - 'pending', 'confirmed', 'cancelled'
- whatsapp_notification (boolean)
- created_at (timestamp)
- expires_at (timestamp) - Pour les réservations temporaires
```

### Table Opening Hours

```sql
opening_hours
- day_of_week (integer) - 1=Lundi, 7=Dimanche
- start_time (time) - "09:00"
- end_time (time) - "18:00"
- is_closed (boolean)
```

## 🛠️ Commandes utiles

```bash
# Développement
ng serve                  # Lance le serveur de dev
ng build                  # Build de production
ng generate component X   # Créer un nouveau composant

# Supabase (depuis leur dashboard)
# - SQL Editor : Requêtes SQL
# - Table Editor : Voir/éditer les données
# - Database > Logs : Voir les requêtes en temps réel
```

## 🔧 Personnalisation

### Modifier les horaires d'ouverture

Allez dans Supabase > Table Editor > `opening_hours`

### Ajouter un service

```sql
INSERT INTO services (name, description, duration_minutes, price, icon)
VALUES ('Nouveau Service', 'Description', 60, 400.00, '✨');
```

### Bloquer un créneau (vacances, maintenance)

```sql
INSERT INTO blocked_slots (date, start_time, end_time, reason)
VALUES ('2024-02-01', '09:00', '18:00', 'Fermeture exceptionnelle');
```

### Modifier les couleurs du thème

Éditez les variables CSS dans chaque composant :

```css
--cream: #FFF8F0;
--sand: #E8DDD0;
--terracotta: #C89B7B;
--bronze: #967259;
--charcoal: #2A2A2A;
```

## 📈 Prochaines étapes

### Interface Admin (à développer)

L'interface admin permettra à la gérante de :
- Voir toutes les réservations (calendrier, liste)
- Confirmer/annuler des réservations
- Gérer les services et les prix
- Bloquer des créneaux
- Voir les statistiques
- Gérer les horaires d'ouverture

### Notifications

- **Email** : Via Supabase Edge Functions + service email (SendGrid, Resend)
- **WhatsApp** : Via Twilio API ou Meta WhatsApp Business API
- **SMS** : Via Twilio

### Paiement en ligne

Intégration Stripe pour accepter les paiements :
```bash
npm install @stripe/stripe-js
```

## 🐛 Résolution de problèmes

### Erreur: "Invalid API key"

→ Vérifiez que vous avez bien copié la clé `anon public` (pas la clé `service_role`)

### Les créneaux ne se chargent pas

→ Vérifiez que le SQL a bien été exécuté dans Supabase
→ Ouvrez la console du navigateur (F12) pour voir les erreurs

### Le temps réel ne fonctionne pas

→ Vérifiez que la réplication est activée dans Database > Replication
→ Vérifiez la console pour les erreurs de WebSocket

### Erreur CORS

→ Dans Supabase Settings > API, vérifiez que votre domaine est autorisé

## 📝 License

Projet d'exemple - libre d'utilisation

## 🤝 Support

Pour toute question :
1. Vérifiez la documentation Supabase : https://supabase.com/docs
2. Consultez les logs dans Supabase Dashboard
3. Ouvrez la console du navigateur (F12) pour voir les erreurs

---

**Développé avec ❤️ en Angular 20 + Supabase**
