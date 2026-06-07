import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { TimeSlot } from '../../models/booking.model';

@Component({
  selector: 'app-time-selection',
  standalone: true,
  imports: [],
  templateUrl: './time-selection.component.html',
  styleUrls: ['./time-selection.component.scss']
})
export class TimeSelectionComponent implements OnInit, OnDestroy {
  timeSlots: TimeSlot[] = [];
  selectedTime: string | null = null;
  loading = true;
  error = '';
  realtimeConnected = false;
  formattedDate = '';

  private selectedDate: string = '';
  private serviceId: string = '';

  constructor(
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentState = this.bookingService.getCurrentState();

    if (!currentState.selectedService || !currentState.selectedDate) {
      this.router.navigate(['/']);
      return;
    }

    this.selectedDate = currentState.selectedDate;
    this.serviceId = currentState.selectedService.id;
    this.formattedDate = this.formatDate(this.selectedDate);

    if (currentState.selectedTime) {
      this.selectedTime = currentState.selectedTime;
    }

    this.loadTimeSlots();
    this.setupRealtime();
  }

  ngOnDestroy(): void {
    this.bookingService.unsubscribeFromBookings();
  }

  async loadTimeSlots(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      this.timeSlots = await this.bookingService.getAvailableSlots(
        this.selectedDate,
        this.serviceId
      );
      this.loading = false;
      this.cdr.detectChanges();
    } catch {
      this.error = 'Impossible de charger les créneaux. Veuillez réessayer.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  setupRealtime(): void {
    this.bookingService.subscribeToBookings(this.selectedDate, () => {
      this.loadTimeSlots();
    });
    this.realtimeConnected = true;
    this.cdr.detectChanges();
  }

  selectTime(time: string): void {
    this.selectedTime = time;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const dayNames   = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  continue(): void {
    if (this.selectedTime) {
      this.bookingService.updateBookingState({
        selectedTime: this.selectedTime,
        currentStep: 4
      });
      this.router.navigate(['/info']);
    }
  }

  goBack(): void {
    this.router.navigate(['/date']);
  }
}
