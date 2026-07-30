import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminStats } from '../admin.service';
import { Booking, BookingStatus } from '../../models/booking.model';

type StatusFilter = BookingStatus | 'all';

@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-bookings.component.html',
  styleUrls: ['./admin-bookings.component.scss']
})
export class AdminBookingsComponent implements OnInit {
  loading = true;
  error = '';
  bookings: Booking[] = [];
  stats: AdminStats = { pending: 0, confirmed: 0, today: 0, upcoming: 0 };

  statusFilter: StatusFilter = 'all';
  dateFilter = '';
  search = '';

  /** id de la réservation en cours de modification, pour désactiver ses boutons */
  busyId: string | null = null;

  /** Clôturer une réservation la fait entrer dans les comptes : on fait confirmer */
  bookingToComplete: Booking | null = null;

  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'pending', label: 'En attente' },
    { value: 'confirmed', label: 'Confirmées' },
    { value: 'completed', label: 'Terminées' },
    { value: 'cancelled', label: 'Annulées' }
  ];

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading = true;
    this.bookings = await this.adminService.getBookings();
    this.stats = this.adminService.computeStats(this.bookings);
    this.loading = false;
    this.cdr.detectChanges();
  }

  get filteredBookings(): Booking[] {
    const term = this.search.trim().toLowerCase();
    return this.bookings.filter(booking => {
      if (this.statusFilter !== 'all' && booking.status !== this.statusFilter) return false;
      if (this.dateFilter && booking.booking_date !== this.dateFilter) return false;
      if (!term) return true;
      return (
        booking.client_name.toLowerCase().includes(term) ||
        booking.client_phone.toLowerCase().includes(term) ||
        booking.client_email.toLowerCase().includes(term)
      );
    });
  }

  resetFilters(): void {
    this.statusFilter = 'all';
    this.dateFilter = '';
    this.search = '';
  }

  canConfirm(booking: Booking): boolean {
    return booking.status === 'pending';
  }

  canComplete(booking: Booking): boolean {
    return booking.status === 'confirmed';
  }

  canCancel(booking: Booking): boolean {
    return booking.status === 'pending' || booking.status === 'confirmed';
  }

  // --- Clôture d'une réservation ---

  askComplete(booking: Booking): void {
    this.bookingToComplete = booking;
    this.error = '';
    this.cdr.detectChanges();
  }

  dismissComplete(): void {
    this.bookingToComplete = null;
    this.cdr.detectChanges();
  }

  async confirmComplete(): Promise<void> {
    const booking = this.bookingToComplete;
    if (!booking) return;

    this.bookingToComplete = null;
    await this.setStatus(booking, 'completed');
  }

  /** Montant qui sera comptabilisé : le tarif figé, sinon celui de la prestation. */
  completionAmount(booking: Booking): string {
    const amount = booking.price_at_booking ?? booking.services?.price;
    if (amount === null || amount === undefined) return 'montant inconnu';
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
      Math.round(Number(amount))
    )} FCFA`;
  }

  async setStatus(booking: Booking, status: BookingStatus): Promise<void> {
    if (!booking.id) return;

    this.busyId = booking.id;
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.adminService.updateBookingStatus(booking.id, status);
    this.busyId = null;

    if (!result.success) {
      this.error = result.error || 'La mise à jour a échoué.';
      this.cdr.detectChanges();
      return;
    }
    await this.load(false);
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'En attente',
      confirmed: 'Confirmé',
      completed: 'Terminé',
      cancelled: 'Annulé'
    };
    return labels[status] || status;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  formatTime(time: string): string {
    return (time || '').slice(0, 5);
  }
}
