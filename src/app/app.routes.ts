import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminMatchGuard } from './guards/admin.guard';

// Toutes les routes sont chargées à la demande : le bundle initial ne contient
// que la coquille de l'application, chaque écran arrive à la navigation.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home/home.component').then(m => m.HomeComponent)
  },
  {
    // Prestations d'une catégorie, seconde étape du choix côté client
    path: 'prestations/:categoryId',
    loadComponent: () =>
      import('./components/service-selection/service-selection.component').then(
        m => m.ServiceSelectionComponent
      )
  },
  {
    path: 'date',
    loadComponent: () =>
      import('./components/date-selection/date-selection.component').then(
        m => m.DateSelectionComponent
      )
  },
  {
    path: 'time',
    loadComponent: () =>
      import('./components/time-selection/time-selection.component').then(
        m => m.TimeSelectionComponent
      )
  },
  {
    path: 'info',
    loadComponent: () =>
      import('./components/client-form/client-form.component').then(m => m.ClientFormComponent)
  },
  {
    path: 'confirmation',
    loadComponent: () =>
      import('./components/confirmation/confirmation.component').then(
        m => m.ConfirmationComponent
      )
  },
  {
    path: 'auth',
    loadComponent: () =>
      import('./components/auth/auth.component').then(m => m.AuthComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./components/reset-password/reset-password.component').then(
        m => m.ResetPasswordComponent
      )
  },
  {
    path: 'mon-espace',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/client-space/client-space.component').then(
        m => m.ClientSpaceComponent
      )
  },
  {
    path: 'mot-de-passe-oublie',
    loadComponent: () =>
      import('./components/forgot-password/forgot-password.component').then(
        m => m.ForgotPasswordComponent
      )
  },
  {
    // Sans guard : la session vient d'être fermée volontairement
    path: 'mot-de-passe-modifie',
    loadComponent: () =>
      import('./components/password-changed/password-changed.component').then(
        m => m.PasswordChangedComponent
      )
  },
  {
    // Sans guard : l'utilisateur est déconnecté à ce stade du parcours
    path: 'confirmer-email',
    loadComponent: () =>
      import('./components/confirm-email/confirm-email.component').then(
        m => m.ConfirmEmailComponent
      )
  },
  {
    // Accessible aux clients comme aux admins : c'est le compte, pas le rôle
    path: 'parametres',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    // canMatch (et non canActivate) : le chunk admin n'est téléchargé que si le
    // visiteur est bien administrateur.
    path: 'admin',
    canMatch: [adminMatchGuard],
    loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES)
  },
  { path: '**', redirectTo: '' }
];
