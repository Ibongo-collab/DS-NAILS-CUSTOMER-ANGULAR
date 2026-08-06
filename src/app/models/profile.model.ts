/**
 * `super_admin` est un accès technique : il peut supprimer une réservation,
 * ce qu'aucun autre rôle ne peut faire, mais les chiffres d'affaires lui sont
 * masqués. Il reste administrateur pour tout le reste.
 */
export type UserRole = 'client' | 'admin' | 'super_admin';

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
