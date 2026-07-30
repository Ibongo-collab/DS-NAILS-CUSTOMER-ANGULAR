export type UserRole = 'client' | 'admin';

export type Gender = 'homme' | 'femme';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  /** NULL pour les comptes créés avant l'ajout du champ */
  gender: Gender | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}
