import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { IconComponent } from '../shared/icon/icon.component';

interface DateOption {
  date: string;
  label: string;
  dayName: string;
  isToday: boolean;
}

@Component({
  selector: 'app-date-selection',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './date-selection.component.html',
  styleUrls: ['./date-selection.component.scss']
})
export class DateSelectionComponent implements OnInit {
  dateOptions: DateOption[] = [];
  selectedDate: string | null = null;
  loading = true;
  readonly skeletonItems = [1, 2, 3, 4, 5, 6, 7];

  constructor(
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentState = this.bookingService.getCurrentState();

    if (!currentState.selectedService) {
      this.router.navigate(['/']);
      return;
    }

    if (currentState.selectedDate) {
      this.selectedDate = currentState.selectedDate;
    }

    Promise.resolve().then(() => {
      this.generateDateOptions();
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  generateDateOptions(): void {
    const today = new Date();
    const options: DateOption[] = [];
    const dayNames   = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const dateString = date.toISOString().split('T')[0];
      const dayLabel = `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]}`;

      let label: string;
      if (i === 0)      { label = `Aujourd'hui`; }
      else if (i === 1) { label = 'Demain'; }
      else              { label = dayLabel; }

      options.push({
        date: dateString,
        label,
        dayName: i < 2 ? dayLabel : '',
        isToday: i === 0
      });
    }

    this.dateOptions = options;
  }

  selectDate(date: string): void {
    this.selectedDate = date;
  }

  continue(): void {
    if (this.selectedDate) {
      this.bookingService.updateBookingState({
        selectedDate: this.selectedDate,
        currentStep: 3
      });
      this.router.navigate(['/time']);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
