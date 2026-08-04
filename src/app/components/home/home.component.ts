import { Component, DestroyRef, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { OpeningHours, ServiceCategory } from '../../models/booking.model';
import { IconComponent } from '../shared/icon/icon.component';

// 1 = Lundi … 7 = Dimanche (cf. colonne day_of_week)
const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export interface OpeningHoursGroup {
  label: string;   // « Lundi – Samedi », « Dimanche »
  hours: string;   // « 9h – 19h » ou « fermé »
  closed: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  /** Un administrateur gère le salon, il ne prend pas de rendez-vous */
  isAdmin = false;
  categories: ServiceCategory[] = [];
  loadingServices = true;
  readonly skeletonRows = [1, 2, 3, 4, 5];
  openingHours: OpeningHoursGroup[] = [];
  loadingHours = true;

  // `isAdmin$` ne se termine jamais : sans cette référence, chaque passage sur
  // l'accueil laisserait un abonné de plus derrière lui.
  private destroyRef = inject(DestroyRef);

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin === true;
        this.cdr.detectChanges();
      });

    this.loadServices();
    this.loadOpeningHours();
  }

  loadOpeningHours(): void {
    this.bookingService.getAllOpeningHours()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hours) => {
          this.openingHours = this.groupOpeningHours(hours);
          this.loadingHours = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loadingHours = false;
          this.cdr.detectChanges();
        }
      });
  }

  /** Regroupe les jours consécutifs partageant les mêmes horaires (ou fermés). */
  private groupOpeningHours(hours: OpeningHours[]): OpeningHoursGroup[] {
    const days = [...hours]
      .filter(h => h.day_of_week >= 1 && h.day_of_week <= 7)
      .sort((a, b) => a.day_of_week - b.day_of_week);

    const groups: OpeningHoursGroup[] = [];
    let start: OpeningHours | null = null;
    let previous: OpeningHours | null = null;

    const sameSlot = (a: OpeningHours, b: OpeningHours) =>
      a.is_closed === b.is_closed &&
      (a.is_closed || (a.start_time === b.start_time && a.end_time === b.end_time));

    const push = (from: OpeningHours, to: OpeningHours) => {
      const first = DAY_NAMES[from.day_of_week - 1];
      const last = DAY_NAMES[to.day_of_week - 1];
      groups.push({
        label: first === last ? first : `${first} – ${last}`,
        hours: from.is_closed
          ? 'fermé'
          : `${this.formatTime(from.start_time)} – ${this.formatTime(from.end_time)}`,
        closed: from.is_closed
      });
    };

    for (const day of days) {
      if (!start || !previous) {
        start = previous = day;
        continue;
      }
      // On casse le groupe si les horaires changent ou si un jour manque à l'appel
      if (!sameSlot(previous, day) || day.day_of_week !== previous.day_of_week + 1) {
        push(start, previous);
        start = day;
      }
      previous = day;
    }
    if (start && previous) push(start, previous);

    return groups;
  }

  /** « 09:00:00 » → « 9h », « 09:30:00 » → « 9h30 » */
  private formatTime(time: string): string {
    const [rawHours, rawMinutes] = (time ?? '').split(':');
    const h = Number(rawHours);
    const m = Number(rawMinutes);
    if (Number.isNaN(h)) return time;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  loadServices(): void {
    this.bookingService.getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.loadingServices = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loadingServices = false;
          this.cdr.detectChanges();
        }
      });
  }

  /** Ouvre la liste des prestations de la catégorie choisie. */
  selectCategory(category: ServiceCategory): void {
    this.router.navigate(['/prestations', category.id]);
  }

  startBooking(): void {
    document.getElementById('services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
