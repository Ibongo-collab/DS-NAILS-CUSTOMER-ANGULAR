import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';
import { BookingState, PricedService } from '../../models/booking.model';
import { IconComponent } from '../shared/icon/icon.component';
import { TimePipe } from '../../pipes/time.pipe';
import { formatLongDate } from '../../utils/date';
import { formatPrice } from '../../utils/money';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [IconComponent, TimePipe],
  templateUrl: './confirmation.component.html',
  styleUrls: ['./confirmation.component.scss']
})
export class ConfirmationComponent implements OnInit {
  bookingState: BookingState | null = null;
  /** Prix de chaque prestation, remise en vigueur à la date du rendez-vous. */
  pricings: PricedService[] = [];
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

    if (!this.bookingState.selectedServices.length ||
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
    const services = this.bookingState?.selectedServices ?? [];
    const date = this.bookingState?.selectedDate;
    if (!services.length) return;

    this.bookingService.getActivePromotions(date || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (promotions) => {
          this.pricings = services.map(s => this.bookingService.priceOf(s, promotions));
          this.cdr.detectChanges();
        }
      });
  }

  /** Prix d'une prestation à sa position dans la liste. */
  pricingAt(index: number): PricedService | null {
    return this.pricings[index] ?? null;
  }

  get totalPrice(): number {
    const services = this.bookingState?.selectedServices ?? [];
    if (this.pricings.length === services.length) {
      return this.pricings.reduce((total, p) => total + p.finalPrice, 0);
    }
    return services.reduce((total, s) => total + (Number(s.price) || 0), 0);
  }

  get totalBasePrice(): number {
    return (this.bookingState?.selectedServices ?? [])
      .reduce((total, s) => total + (Number(s.price) || 0), 0);
  }

  get hasDiscount(): boolean {
    return this.pricings.some(p => p.discountPercent > 0);
  }

  /** Durée cumulée du rendez-vous, en minutes. */
  get totalDuration(): number {
    return (this.bookingState?.selectedServices ?? [])
      .reduce((total, s) => total + (Number(s.duration_minutes) || 0), 0);
  }

  priceLabel(price: number): string {
    // Deux décimales, comme les deux écrans précédents : le montant confirmé
    // doit s'écrire exactement comme celui qui a été choisi.
    return formatPrice(price);
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
    return formatLongDate(dateString);
  }

  calculateEndTime(): string {
    if (!this.bookingState?.selectedTime || !this.bookingState?.selectedServices.length) {
      return '';
    }

    const [hours, minutes] = this.bookingState.selectedTime.split(':').map(Number);
    // Le créneau couvre l'ensemble des prestations, pas seulement la première
    const endMinutes = minutes + this.totalDuration;
    const endHours = hours + Math.floor(endMinutes / 60);
    const finalMinutes = endMinutes % 60;

    return `${endHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
  }

  newBooking(): void {
    this.bookingService.resetBookingState();
    this.router.navigate(['/']);
  }
}
