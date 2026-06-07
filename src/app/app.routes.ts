import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { DateSelectionComponent } from './components/date-selection/date-selection.component';
import { TimeSelectionComponent } from './components/time-selection/time-selection.component';
import { ClientFormComponent } from './components/client-form/client-form.component';
import { ConfirmationComponent } from './components/confirmation/confirmation.component';
import { AuthComponent } from './components/auth/auth.component';
import { ClientSpaceComponent } from './components/client-space/client-space.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'date', component: DateSelectionComponent },
  { path: 'time', component: TimeSelectionComponent },
  { path: 'info', component: ClientFormComponent },
  { path: 'confirmation', component: ConfirmationComponent },
  { path: 'auth', component: AuthComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'mon-espace', component: ClientSpaceComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
