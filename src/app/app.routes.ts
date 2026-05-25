import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { ServiceSelectionComponent } from './components/service-selection/service-selection.component';
import { DateSelectionComponent } from './components/date-selection/date-selection.component';
import { TimeSelectionComponent } from './components/time-selection/time-selection.component';
import { ClientFormComponent } from './components/client-form/client-form.component';
import { ConfirmationComponent } from './components/confirmation/confirmation.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'service', component: ServiceSelectionComponent },
  { path: 'date', component: DateSelectionComponent },
  { path: 'time', component: TimeSelectionComponent },
  { path: 'info', component: ClientFormComponent },
  { path: 'confirmation', component: ConfirmationComponent },
  { path: '**', redirectTo: '' }
];
