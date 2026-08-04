// Environnement de développement.
//
// Substitué à `environment.ts` par la configuration « development » de
// angular.json (fileReplacements). Le projet Supabase est le même : pointer
// ici vers un projet de test suffirait à isoler les données de développement.

export const environment = {
  production: false,
  supabase: {
    url: 'https://nfttebanbzcquumjnjlx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdHRlYmFuYnpjcXV1bWpuamx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjg5MzcsImV4cCI6MjA5NTMwNDkzN30.65iAD6Tqw6vA1n82OtZjFASHrIGnqbvfhww-qpGBAeU'
  }
};
