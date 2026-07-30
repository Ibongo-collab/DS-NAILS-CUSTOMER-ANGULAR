import { Routes } from '@angular/router';
import { adminGuard } from '../guards/admin.guard';
import { AdminService } from './admin.service';
import { AdminLayoutComponent } from './admin-layout/admin-layout.component';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    // Deuxième barrière : canMatch a déjà filtré, mais canActivate protège aussi
    // les navigations internes une fois le chunk chargé (ex. rôle révoqué).
    canActivate: [adminGuard],
    // Fourni ici, donc instancié avec le chunk admin et non dans le bundle client
    providers: [AdminService],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'reservations' },
      {
        path: 'reservations',
        loadComponent: () =>
          import('./bookings/admin-bookings.component').then(m => m.AdminBookingsComponent)
      },
      {
        path: 'statistiques',
        loadComponent: () =>
          import('./stats/admin-stats.component').then(m => m.AdminStatsComponent)
      },
      {
        path: 'prestations',
        loadComponent: () =>
          import('./services/admin-services.component').then(m => m.AdminServicesComponent)
      },
      {
        path: 'horaires',
        loadComponent: () =>
          import('./opening-hours/admin-opening-hours.component').then(
            m => m.AdminOpeningHoursComponent
          )
      },
      {
        path: 'indisponibilites',
        loadComponent: () =>
          import('./blocked-slots/admin-blocked-slots.component').then(
            m => m.AdminBlockedSlotsComponent
          )
      },
      { path: '**', redirectTo: 'reservations' }
    ]
  }
];
