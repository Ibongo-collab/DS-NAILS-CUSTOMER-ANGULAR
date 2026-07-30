import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/**
 * Autorise uniquement les profils `role = 'admin'`.
 *
 * Utilisé en `canMatch` sur la route lazy : la vérification a lieu AVANT que le
 * routeur ne résolve `loadChildren`, donc le chunk admin n'est même pas
 * téléchargé par un visiteur non autorisé.
 *
 * Ce guard est un confort d'UX, pas une frontière de sécurité : la protection
 * réelle des données est assurée par les policies RLS (`public.is_admin()`).
 */
const resolveAdminAccess = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAdmin$.pipe(
    // undefined = profil en cours de chargement, on attend sa résolution
    filter((isAdmin): isAdmin is boolean => isAdmin !== undefined),
    take(1),
    map(isAdmin => {
      if (isAdmin) return true;
      // Non connecté → connexion ; connecté sans le rôle → accueil
      return authService.isAuthenticated
        ? router.createUrlTree(['/'])
        : router.createUrlTree(['/auth'], { queryParams: { redirect: '/admin' } });
    })
  );
};

export const adminMatchGuard: CanMatchFn = () => resolveAdminAccess();

export const adminGuard: CanActivateFn = () => resolveAdminAccess();
