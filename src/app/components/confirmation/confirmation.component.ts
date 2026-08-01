import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';
import { BookingState } from '../../models/booking.model';
import { IconComponent } from '../shared/icon/icon.component';
import { TimePipe } from '../../pipes/time.pipe';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [IconComponent, TimePipe],
  templateUrl: './confirmation.component.html',
  styleUrls: ['./confirmation.component.scss']
})
export class ConfirmationComponent implements OnInit {
  bookingState: BookingState | null = null;
  private isAuthenticated = false;

  constructor(
    private bookingService: BookingService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.bookingState = this.bookingService.getCurrentState();

    if (!this.bookingState.selectedService ||
        !this.bookingState.selectedDate ||
        !this.bookingState.selectedTime ||
        !this.bookingState.clientInfo) {
      this.router.navigate(['/']);
      return;
    }

    this.authService.currentUser$.subscribe(user => {
      if (user === undefined) return; // session pas encore résolue
      this.isAuthenticated = !!user;
      this.cdr.detectChanges();
    });
  }

  /** Adresse saisie à la réservation, seule clé de rattachement possible. */
  get clientEmail(): string {
    return this.bookingState?.clientInfo?.email?.trim() || '';
  }

  /**
   * L'invitation à créer un compte n'a de sens que si la réservation porte une
   * adresse — c'est elle qui permettra de la retrouver — et si la personne
   * n'est pas déjà connectée.
   */
  get showAccountInvite(): boolean {
    return !this.isAuthenticated && !!this.clientEmail;
  }

  /** L'adresse part en paramètre pour être pré-remplie, et garantir le lien. */
  createAccount(): void {
    this.router.navigate(['/auth'], {
      queryParams: { tab: 'register', email: this.clientEmail }
    });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const dayNames   = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  calculateEndTime(): string {
    if (!this.bookingState?.selectedTime || !this.bookingState?.selectedService) {
      return '';
    }

    const [hours, minutes] = this.bookingState.selectedTime.split(':').map(Number);
    const durationMinutes = this.bookingState.selectedService.duration_minutes;
    const endMinutes = minutes + durationMinutes;
    const endHours = hours + Math.floor(endMinutes / 60);
    const finalMinutes = endMinutes % 60;

    return `${endHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
  }

  newBooking(): void {
    this.bookingService.resetBookingState();
    this.router.navigate(['/']);
  }
}
