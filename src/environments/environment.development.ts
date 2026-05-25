// Environment de développement

export const environment = {
  production: false,
  supabase: {
    url: 'https://nfttebanbzcquumjnjlx.supabase.co', 
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdHRlYmFuYnpjcXV1bWpuamx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjg5MzcsImV4cCI6MjA5NTMwNDkzN30.65iAD6Tqw6vA1n82OtZjFASHrIGnqbvfhww-qpGBAeU' 
  }
};

/*
INSTRUCTIONS DE CONFIGURATION:

1. Allez sur https://app.supabase.com
2. Créez un nouveau projet (gratuit)
3. Une fois créé, allez dans Settings > API
4. Copiez:
   - Project URL → remplacez 'VOTRE_SUPABASE_URL'
   - anon/public key → remplacez 'VOTRE_SUPABASE_ANON_KEY'

5. Ensuite, exécutez le script SQL dans supabase-schema.sql:
   - Database > SQL Editor
   - Copiez/collez le contenu de supabase-schema.sql
   - Cliquez "Run"

6. Activez le temps réel:
   - Database > Replication
   - Activez pour la table 'bookings'
*/
