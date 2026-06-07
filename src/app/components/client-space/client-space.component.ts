import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { Booking } from '../../models/booking.model';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-client-space',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './client-space.component.html',
  styleUrls: ['./client-space.component.scss']
})
export class ClientSpaceComponent implements OnInit {
  loading = true;
  upcomingBookings: Booking[] = [];
  pastBookings: Booking[] = [];
  userName = '';
  cancellingId: string | null = null;
  cancelError = '';
  showCancelModal = false;
  bookingToCancel: Booking | null = null;

  private readonly PAGE_SIZE = 10;
  private historyVisibleCount = this.PAGE_SIZE;

  get visiblePastBookings(): Booking[] {
    return this.pastBookings.slice(0, this.historyVisibleCount);
  }

  get hasMoreHistory(): boolean {
    return this.historyVisibleCount < this.pastBookings.length;
  }

  showMoreHistory(): void {
    this.historyVisibleCount += this.PAGE_SIZE;
  }

  constructor(
    private authService: AuthService,
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAuthenticated) {
      this.router.navigate(['/auth']);
      return;
    }

    this.userName = this.authService.getUserName();
    this.loadBookings();
  }

  async loadBookings(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading = true;
    const email = this.authService.getUserEmail();

    if (!email) {
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    const bookings = await this.bookingService.getBookingsByEmail(email);

    this.upcomingBookings = bookings.filter(b =>
      ['pending', 'confirmed'].includes(b.status)
    );

    this.pastBookings = bookings.filter(b =>
      ['completed', 'cancelled'].includes(b.status)
    );

    this.historyVisibleCount = this.PAGE_SIZE;
    this.loading = false;
    this.cdr.detectChanges();
  }

  canCancel(booking: Booking): boolean {
    const today = new Date().toISOString().split('T')[0];
    return ['pending', 'confirmed'].includes(booking.status) && booking.booking_date >= today;
  }

  confirmCancel(booking: Booking): void {
    this.bookingToCancel = booking;
    this.showCancelModal = true;
    this.cancelError = '';
    this.cdr.detectChanges();
  }

  dismissCancel(): void {
    this.showCancelModal = false;
    this.bookingToCancel = null;
    this.cdr.detectChanges();
  }

  async proceedCancel(): Promise<void> {
    if (!this.bookingToCancel?.id) return;

    this.cancellingId = this.bookingToCancel.id;
    this.cdr.detectChanges();

    const result = await this.bookingService.cancelBooking(this.bookingToCancel.id);

    this.cancellingId = null;
    this.showCancelModal = false;
    this.bookingToCancel = null;

    if (result.success) {
      await this.loadBookings(false);
    } else {
      this.cancelError = result.error || 'Impossible d\'annuler la réservation. Veuillez réessayer.';
    }
    this.cdr.detectChanges();
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending:   'En attente',
      confirmed: 'Confirmé',
      completed: 'Terminé',
      cancelled: 'Annulé'
    };
    return labels[status] || status;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    const days   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  newBooking(): void {
    this.router.navigate(['/service']);
  }
}
