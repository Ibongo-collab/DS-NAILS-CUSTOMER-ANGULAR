# 💅 DS Nails — Système de réservation

Application de réservation en ligne pour le salon DS Nails, développée avec **Angular 21** et **Supabase**.

## ✨ Fonctionnalités

- 📅 Réservation en ligne en 4 étapes simples
- 🔄 **Créneaux tenus à jour** : les horaires déjà pris ou bloqués sont écartés
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

La base se construit par une **suite de scripts SQL**, à jouer dans un ordre
précis : plusieurs d'entre eux redéfinissent les mêmes fonctions, et les
intervertir fait régresser la base sans lever d'erreur.

👉 **La séquence complète est dans [MIGRATIONS.md](MIGRATIONS.md).** Suivez-la
de bout en bout.

Pour chaque fichier : **Database > SQL Editor > New query**, coller le contenu,
**Run**. La réponse attendue est « Success. No rows returned ».

### Étape 3: Récupérer les clés API

1. Dans Supabase, allez dans **Settings > API**
2. Copiez :
   - **Project URL** (ex: https://xxxxx.supabase.co)
   - **anon public** key (la clé publique)

### Étape 4: Configurer l'application

Deux fichiers, de même contenu :

- `src/environments/environment.ts` — utilisé par `ng build` (production)
- `src/environments/environment.development.ts` — utilisé par `ng serve`,
  substitué au premier par la configuration `development` d'angular.json

```typescript
export const environment = {
  production: true,
  supabase: {
    url: 'https://xxxxx.supabase.co', // ← Votre Project URL
    anonKey: 'eyJhbGc...'              // ← Votre clé anon
  }
};
```

La clé **anon** est publique par conception : elle identifie le projet et
n'autorise rien par elle-même, ce sont les policies RLS qui décident. Ne jamais
placer ici la clé `service_role`, qui contourne toutes les policies.

## 📱 Structure de l'application

```
src/app/
├── components/
│   ├── home/                    # Page d'accueil
│   ├── service-selection/       # Choix du service
│   ├── date-selection/          # Choix de la date
│   ├── time-selection/          # Choix du créneau
│   ├── client-form/             # Formulaire client
│   └── confirmation/            # Confirmation de réservation
├── services/
│   ├── supabase.service.ts      # Service Supabase de base
│   └── booking.service.ts       # Logique métier des réservations
├── models/
│   └── booking.model.ts         # Interfaces TypeScript
└── app.routes.ts                # Configuration des routes
```

## 🔄 Comment un créneau déjà pris est-il écarté ?

Il n'y a pas d'abonnement temps réel : la table `bookings` n'est plus lisible
par un visiteur non connecté (`supabase-secure-bookings.sql`), donc Postgres ne
lui diffuserait aucun changement. Trois filets se succèdent :

```
Choix de la date  →  get_booked_intervals_range   les jours pleins sont grisés
Choix de l'heure  →  get_booked_intervals         les créneaux pris disparaissent
                     + relecture au retour sur l'onglet
Validation        →  create_booking               refus si le créneau a été pris
                                                  entre-temps  ← seul décisif
```

Les deux premiers sont du confort d'affichage et peuvent être périmés de
quelques secondes. Le contrôle qui fait foi est celui de `create_booking`, dans
la même transaction que l'insertion : deux personnes qui valident le même
créneau à la même seconde ne peuvent pas réussir toutes les deux.

## 📦 Budgets de build

`ng build` surveille deux seuils (angular.json) :

- **bundle initial — alerte à 620 ko.** Le plancher est structurel : environ
  200 ko pour `@supabase/supabase-js` et le reste pour Angular. Le seuil laisse
  une marge d'une trentaine de ko, de quoi révéler un écran qui cesserait
  d'être chargé à la demande.
- **feuille de style de composant — alerte à 6 ko.** Les styles communs de
  l'administration ne sont donc pas partagés par `@use` — Sass en recopierait
  l'intégralité dans chaque écran. Ils sont posés une fois par
  `admin-layout`, déclaré `ViewEncapsulation.None` et porté par `.admin-shell`.

## 🎨 Parcours utilisateur

### Interface Client

1. **Page d'accueil** → Présentation du salon
2. **Sélection du service** → Choisir manucure, pédicure, coiffure, etc.
3. **Sélection de la date** → 7 prochains jours disponibles
4. **Sélection de l'horaire** → Créneaux encore libres
5. **Formulaire client** → Nom, téléphone, email, option WhatsApp
6. **Confirmation** → Récapitulatif complet de la réservation

### Prévention des doubles réservations

Le système utilise plusieurs mécanismes :

1. **Contrainte unique en base** : Impossible d'insérer 2 réservations au même créneau
2. **Status 'pending'** : Verrouillage temporaire de 10 minutes
3. **Contrôle final dans `create_booking`** : refus si le créneau vient d'être pris
4. **Cache de 30 s**, vidé au retour sur l'onglet

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

Les variables sont dans `src/styles.scss`, sous `:root` :

```css
--gold:      #F3B1F1;   /* rose accent : liens, boutons */
--heading:   #69005A;   /* titres et liens */
--bg:        #FFFFFF;
--text:      #2A2A2A;
```

## 🛡️ Espace d'administration

Accessible aux comptes `role = 'admin'` (cf. `supabase-admin-role.sql`), sur
`/admin` : réservations, statistiques comptables, prestations et catégories,
promotions, horaires, indisponibilités, notifications.

Le guide destiné à la gérante est dans [GUIDE-ADMIN.md](GUIDE-ADMIN.md).

Le code de cet espace est chargé à la demande, derrière un `canMatch` : un
visiteur qui n'est pas administrateur ne le télécharge jamais. Ce n'est
toutefois qu'un confort d'affichage — la protection réelle des données tient
aux policies RLS, qui s'appuient sur `public.is_admin()`.

## 📈 Prochaines étapes

### Notifications

La file d'attente et les rappels existent (`supabase-notifications.sql`), en
mode simulation : les messages sont enregistrés mais rien n'est envoyé. Poser
les secrets `WHATSAPP_TOKEN` et `WHATSAPP_PHONE_ID` puis déployer la fonction
`supabase/functions/send-notifications` suffit à les faire partir.

### Paiement en ligne

Intégration Stripe pour accepter les paiements :
```bash
npm install @stripe/stripe-js
```

## 🐛 Résolution de problèmes

### Erreur: "Invalid API key"

→ Vérifiez que vous avez bien copié la clé `anon public` (pas la clé `service_role`)

### Les créneaux ne se chargent pas

→ Vérifiez que toute la séquence de MIGRATIONS.md a bien été exécutée
→ Ouvrez la console du navigateur (F12) pour voir les erreurs

### Un créneau déjà pris reste affiché

→ Normal quelques secondes : la liste est mise en cache 30 s et relue au retour
   sur l'onglet. La validation, elle, refusera le créneau.

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

**Développé avec ❤️ en Angular 21 + Supabase**
