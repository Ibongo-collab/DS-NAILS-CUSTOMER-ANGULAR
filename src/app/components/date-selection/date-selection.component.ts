import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { IconComponent } from '../shared/icon/icon.component';
import { DateAvailability } from '../../models/booking.model';
import { toDateString } from '../../utils/date';

interface DateOption {
  date: string;
  label: string;
  dayName: string;
  isToday: boolean;
  available: boolean;
  /** Motif affiché quand la date n'est pas réservable */
  unavailableLabel: string;
  slots: number;
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

    this.loadDates(currentState.selectedService.id);
  }

  private async loadDates(serviceId: string): Promise<void> {
    this.generateDateOptions();

    const availability = await this.bookingService.getDatesAvailability(
      this.dateOptions.map(option => option.date),
      serviceId
    );

    this.applyAvailability(availability);

    // Une date pré-sélectionnée peut avoir été bloquée entre-temps
    if (this.selectedDate && !this.dateOptions.find(o => o.date === this.selectedDate)?.available) {
      this.selectedDate = null;
    }

    this.loading = false;
    this.cdr.detectChanges();
  }

  private applyAvailability(availability: Map<string, DateAvailability>): void {
    const labels: Record<string, string> = {
      closed: 'Fermé',
      blocked: 'Indisponible',
      full: 'Complet'
    };

    for (const option of this.dateOptions) {
      const info = availability.get(option.date);
      // Sans information (requête en échec), on laisse la date sélectionnable
      if (!info) continue;

      option.available = info.available;
      option.slots = info.slots;
      option.unavailableLabel = info.reason ? labels[info.reason] : '';
    }
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

      // `toDateString` et non `toISOString` : ce dernier bascule en UTC et,
      // dans un fuseau positif, renvoie la veille entre minuit et l'aube — la
      // date envoyée au serveur ne correspondrait plus au libellé affiché.
      const dateString = toDateString(date);
      const dayLabel = `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]}`;

      let label: string;
      if (i === 0)      { label = `Aujourd'hui`; }
      else if (i === 1) { label = 'Demain'; }
      else              { label = dayLabel; }

      options.push({
        date: dateString,
        label,
        dayName: i < 2 ? dayLabel : '',
        isToday: i === 0,
        // Optimiste par défaut : la disponibilité réelle arrive juste après
        available: true,
        unavailableLabel: '',
        slots: 0
      });
    }

    this.dateOptions = options;
  }

  selectDate(option: DateOption): void {
    if (!option.available) return;
    this.selectedDate = option.date;
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
