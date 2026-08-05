import { ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { IconComponent } from '../shared/icon/icon.component';
import { DurationPipe } from '../../pipes/duration.pipe';
import { DateAvailability, PricedService, Promotion, Service, TimeSlot } from '../../models/booking.model';
import { priceService } from '../../services/pricing';
import {
  daysBetween,
  endOfMonth,
  parseDateString,
  toDateString,
  todayString
} from '../../utils/date';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Une case du calendrier. `null` pour les cases vides d'avant le 1er du mois. */
export interface DayCell {
  date: string;
  day: number;
  isToday: boolean;
  /** Dans la fenêtre de réservation ET encore ouvert */
  selectable: boolean;
  /** « Fermé », « Complet »… vide si la date est simplement hors fenêtre */
  reason: string;
}

@Component({
  selector: 'app-schedule-selection',
  standalone: true,
  imports: [IconComponent, DurationPipe],
  templateUrl: './schedule-selection.component.html',
  styleUrls: ['./schedule-selection.component.scss']
})
export class ScheduleSelectionComponent implements OnInit, OnDestroy {
  service: Service | null = null;
  pricing: PricedService | null = null;

  /** Mois affiché dans le calendrier */
  viewYear = 0;
  viewMonth = 0;
  /** Six lignes de sept cases au plus ; `null` = case vide */
  weeks: (DayCell | null)[][] = [];
  readonly weekDayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  selectedDate: string | null = null;
  selectedTime: string | null = null;

  timeSlots: TimeSlot[] = [];
  loadingDates = true;
  error = '';

  /** Description repliée par défaut : elle peut faire plusieurs lignes */
  descriptionOpen = false;

  private availability = new Map<string, DateAvailability>();
  private promotions: Promotion[] = [];
  private horizonStart = '';
  private horizonEnd = '';

  private destroyRef = inject(DestroyRef);

  constructor(
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const state = this.bookingService.getCurrentState();

    if (!state.selectedService) {
      this.router.navigate(['/']);
      return;
    }

    this.service = state.selectedService;
    this.selectedDate = state.selectedDate;
    this.selectedTime = state.selectedTime;

    // Le mois en cours est ouvert à la réservation, d'aujourd'hui à son dernier
    // jour. La fenêtre se referme donc au fil du mois : le 28 août, il ne reste
    // que quatre jours proposés.
    this.horizonStart = todayString();
    this.horizonEnd = endOfMonth(this.horizonStart);

    const today = new Date();
    this.viewYear = today.getFullYear();
    this.viewMonth = today.getMonth();

    this.buildCalendar();
    this.loadAvailability();
    this.loadPromotions();

    document.addEventListener('visibilitychange', this.refreshOnReturn);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.refreshOnReturn);
  }

  /**
   * Recharge tout au retour sur l'onglet.
   *
   * Les créneaux étant tenus en mémoire, un onglet laissé ouvert afficherait
   * sinon des horaires pris entre-temps. Champ fléché : la référence doit être
   * stable pour pouvoir être retirée.
   */
  private refreshOnReturn = (): void => {
    if (document.hidden) return;
    this.loadAvailability();
  };

  // ==================== CHARGEMENTS ====================

  private async loadAvailability(): Promise<void> {
    if (!this.service) return;

    const nbJours = daysBetween(this.horizonStart, this.horizonEnd);
    const dates = Array.from({ length: nbJours }, (_, i) => this.dateAt(i));

    this.availability = await this.bookingService.getDatesAvailability(dates, this.service.id);
    this.loadingDates = false;

    // Le service absorbe ses erreurs et rend une carte vide : sans ce contrôle,
    // une panne réseau se traduirait par un calendrier entièrement grisé, sans
    // le moindre mot d'explication.
    this.error = this.availability.size
      ? ''
      : 'Impossible de charger les disponibilités. Vérifiez votre connexion et réessayez.';

    // Une date retenue avant un aller-retour peut avoir été bloquée entre-temps
    if (this.selectedDate && !this.availability.get(this.selectedDate)?.available) {
      this.selectedDate = null;
      this.selectedTime = null;
    }

    if (this.selectedDate) {
      this.showSlots(this.selectedDate);
      // L'horaire retenu a pu être pris pendant que l'onglet était en veille
      if (this.selectedTime && !this.timeSlots.some(s => s.time === this.selectedTime && s.available)) {
        this.selectedTime = null;
      }
    } else {
      this.timeSlots = [];
    }

    this.buildCalendar();
    this.cdr.detectChanges();
  }

  private loadPromotions(): void {
    this.bookingService.getPromotionsInRange(this.horizonStart, this.horizonEnd)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (promotions) => {
          this.promotions = promotions;
          this.refreshPricing();
          this.cdr.detectChanges();
        }
        // Une promotion illisible n'empêche pas de réserver : prix public affiché
      });
  }

  /**
   * Créneaux d'une journée, pris dans ce qui a déjà été chargé.
   *
   * Aucun appel réseau ici : `getDatesAvailability` calcule les créneaux de
   * chaque jour en même temps que la disponibilité des dates. Les relire au
   * clic coûterait un aller-retour pour un résultat identique — et c'est ce
   * délai qui donnait l'impression que les horaires ne s'affichaient pas.
   */
  private showSlots(date: string): void {
    this.timeSlots = this.availability.get(date)?.slots ?? [];
  }

  // ==================== PRIX ====================

  /** La remise dépend du jour du rendez-vous : elle suit la date choisie. */
  private refreshPricing(): void {
    if (!this.service) return;
    this.pricing = priceService(
      this.service,
      this.promotions,
      this.selectedDate || this.horizonStart
    );
  }

  priceLabel(price: number): string {
    return `${new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price || 0)} FCFA`;
  }

  // ==================== CALENDRIER ====================

  /** Date du calendrier à J+n, en heure locale. */
  private dateAt(offset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return toDateString(date);
  }

  private buildCalendar(): void {
    const premier = new Date(this.viewYear, this.viewMonth, 1);
    const joursDansLeMois = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();

    // Semaine commençant le lundi : dimanche (0) devient la 7e colonne
    const decalage = (premier.getDay() + 6) % 7;

    const cases: (DayCell | null)[] = Array(decalage).fill(null);
    const today = todayString();

    for (let jour = 1; jour <= joursDansLeMois; jour++) {
      const date = toDateString(new Date(this.viewYear, this.viewMonth, jour));
      const dansLaFenetre = date >= this.horizonStart && date <= this.horizonEnd;
      const info = this.availability.get(date);

      cases.push({
        date,
        day: jour,
        isToday: date === today,
        // Optimiste tant que la disponibilité n'est pas revenue, pour ne pas
        // faire clignoter tout le calendrier au chargement
        selectable: dansLaFenetre && (info ? info.available : this.loadingDates),
        reason: dansLaFenetre && info && !info.available ? this.reasonLabel(info) : ''
      });
    }

    while (cases.length % 7 !== 0) cases.push(null);

    this.weeks = [];
    for (let i = 0; i < cases.length; i += 7) {
      this.weeks.push(cases.slice(i, i + 7));
    }
  }

  private reasonLabel(info: DateAvailability): string {
    const labels: Record<string, string> = {
      closed: 'Fermé',
      blocked: 'Indisponible',
      full: 'Complet'
    };
    return info.reason ? labels[info.reason] : '';
  }

  get monthLabel(): string {
    return `${MOIS[this.viewMonth]} ${this.viewYear}`;
  }

  /** « Réservation possible jusqu'au 31 août. » */
  get horizonLabel(): string {
    const fin = parseDateString(this.horizonEnd);
    return `${fin.getDate()} ${MOIS[fin.getMonth()]}`;
  }

  /** Vrai si le mois affiché contient au moins un jour réservable. */
  private monthHasWindow(year: number, month: number): boolean {
    const debutDuMois = toDateString(new Date(year, month, 1));
    const finDuMois = toDateString(new Date(year, month + 1, 0));
    return debutDuMois <= this.horizonEnd && finDuMois >= this.horizonStart;
  }

  get canGoPrevious(): boolean {
    const m = this.viewMonth === 0 ? 11 : this.viewMonth - 1;
    const y = this.viewMonth === 0 ? this.viewYear - 1 : this.viewYear;
    return this.monthHasWindow(y, m);
  }

  get canGoNext(): boolean {
    const m = this.viewMonth === 11 ? 0 : this.viewMonth + 1;
    const y = this.viewMonth === 11 ? this.viewYear + 1 : this.viewYear;
    return this.monthHasWindow(y, m);
  }

  previousMonth(): void {
    if (!this.canGoPrevious) return;
    if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
    else this.viewMonth--;
    this.buildCalendar();
  }

  nextMonth(): void {
    if (!this.canGoNext) return;
    if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
    else this.viewMonth++;
    this.buildCalendar();
  }

  // ==================== SÉLECTION ====================

  selectDate(cell: DayCell): void {
    if (!cell.selectable || cell.date === this.selectedDate) return;

    this.selectedDate = cell.date;
    this.selectedTime = null;
    this.refreshPricing();
    this.showSlots(cell.date);
  }

  selectTime(slot: TimeSlot): void {
    if (!slot.available) return;
    this.selectedTime = slot.time;
  }

  /** « vendredi 7 août », en regard de la grille des créneaux. */
  get selectedDateLabel(): string {
    if (!this.selectedDate) return '';
    const date = parseDateString(this.selectedDate);
    return `${JOURS[date.getDay()].toLowerCase()} ${date.getDate()} ${MOIS[date.getMonth()]}`;
  }

  get canContinue(): boolean {
    return !!this.selectedDate && !!this.selectedTime;
  }

  continue(): void {
    if (!this.canContinue) return;

    this.bookingService.updateBookingState({
      selectedDate: this.selectedDate,
      selectedTime: this.selectedTime,
      currentStep: 3
    });
    this.router.navigate(['/info']);
  }

  toggleDescription(): void {
    this.descriptionOpen = !this.descriptionOpen;
  }

  /** La croix ramène à la liste d'où la prestation a été choisie. */
  clearService(): void {
    const categoryId = this.service?.category_id;
    this.router.navigate(categoryId ? ['/prestations', categoryId] : ['/']);
  }

  goBack(): void {
    this.clearService();
  }
}
