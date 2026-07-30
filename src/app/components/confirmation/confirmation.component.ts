import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
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

  constructor(
    private bookingService: BookingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.bookingState = this.bookingService.getCurrentState();

    if (!this.bookingState.selectedService ||
        !this.bookingState.selectedDate ||
        !this.bookingState.selectedTime ||
        !this.bookingState.clientInfo) {
      this.router.navigate(['/']);
    }
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
