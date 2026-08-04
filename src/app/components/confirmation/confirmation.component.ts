import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';
import { BookingState, PricedService } from '../../models/booking.model';
import { IconComponent } from '../shared/icon/icon.component';
import { TimePipe } from '../../pipes/time.pipe';
import { parseDateString } from '../../utils/date';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [IconComponent, TimePipe],
  templateUrl: './confirmation.component.html',
  styleUrls: ['./confirmation.component.scss']
})
export class ConfirmationComponent implements OnInit {
  bookingState: BookingState | null = null;
  /** Prix réellement facturé : remise en vigueur à la date du rendez-vous. */
  pricing: PricedService | null = null;
  private isAuthenticated = false;
  private destroyRef = inject(DestroyRef);

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

    this.loadPricing();

    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(user => {
        if (user === undefined) return; // session pas encore résolue
        this.isAuthenticated = !!user;
        this.cdr.detectChanges();
      });
  }

  /**
   * La remise retenue est celle en vigueur le jour du rendez-vous, comme le
   * calcule `create_booking` : ce récapitulatif doit annoncer le montant qui a
   * été figé, pas celui du jour de la réservation.
   */
  private loadPricing(): void {
    const service = this.bookingState?.selectedService;
    const date = this.bookingState?.selectedDate;
    if (!service) return;

    this.bookingService.getActivePromotions(date || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (promotions) => {
          this.pricing = this.bookingService.priceOf(service, promotions);
          this.cdr.detectChanges();
        }
      });
  }

  priceLabel(price: number): string {
    return `${new Intl.NumberFormat('fr-FR').format(price || 0)} FCFA`;
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
    const date = parseDateString(dateString);
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
