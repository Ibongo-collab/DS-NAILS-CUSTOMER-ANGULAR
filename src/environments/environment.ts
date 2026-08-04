// Environnement de production. C'est ce fichier qu'utilise `ng build`.
//
// La clé « anon » est publique par conception : elle identifie le projet, elle
// n'autorise rien par elle-même. Ce sont les policies RLS qui décident de ce
// qui est lisible ou modifiable. Ne jamais placer ici la clé `service_role`,
// qui, elle, contourne toutes les policies.

export const environment = {
  production: true,
  supabase: {
    url: 'https://nfttebanbzcquumjnjlx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdHRlYmFuYnpjcXV1bWpuamx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjg5MzcsImV4cCI6MjA5NTMwNDkzN30.65iAD6Tqw6vA1n82OtZjFASHrIGnqbvfhww-qpGBAeU'
  }
};
