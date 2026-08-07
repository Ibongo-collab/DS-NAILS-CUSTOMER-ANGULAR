import { ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { IconComponent } from '../shared/icon/icon.component';
import { DurationPipe } from '../../pipes/duration.pipe';
import { DateAvailability, PricedService, Promotion, Service, TimeSlot } from '../../models/booking.model';
import { priceService } from '../../services/pricing';
import { formatPrice } from '../../utils/money';
import {
  daysBetween,
  endOfMonth,
  parseDateString,
  toDateString,
  todayString,
  MOIS_LONGS,
  formatDayMonth
} from '../../utils/date';


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
  /** Prestations du rendez-vous, dans l'ordre d'ajout. */
  services: Service[] = [];
  /** Prix de chacune, remise du jour retenu déduite. Même ordre. */
  pricings: PricedService[] = [];

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

  /** Descriptions repliées par défaut : elles peuvent faire plusieurs lignes */
  openDescriptions = new Set<string>();

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

    if (!state.selectedServices.length) {
      this.router.navigate(['/']);
      return;
    }

    this.services = state.selectedServices;
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
    if (!this.services.length) return;

    const nbJours = daysBetween(this.horizonStart, this.horizonEnd);
    const dates = Array.from({ length: nbJours }, (_, i) => this.dateAt(i));

    // Le créneau doit accueillir toutes les prestations : la disponibilité se
    // calcule sur la durée cumulée, pas sur celle de la première.
    this.availability = await this.bookingService.getDatesAvailability(
      dates,
      this.services.map(s => s.id)
    );
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
    const jour = this.selectedDate || this.horizonStart;
    this.pricings = this.services.map(s => priceService(s, this.promotions, jour));
  }

  /** Prix d'une prestation à sa position dans la liste. */
  pricingAt(index: number): PricedService | null {
    return this.pricings[index] ?? null;
  }

  /** Durée cumulée du rendez-vous, en minutes. */
  get totalDuration(): number {
    return this.services.reduce((total, s) => total + (Number(s.duration_minutes) || 0), 0);
  }

  /** Somme des prix de départ, remises déduites. */
  get totalPrice(): number {
    if (this.pricings.length === this.services.length) {
      return this.pricings.reduce((total, p) => total + p.finalPrice, 0);
    }
    // Promotions pas encore chargées : on annonce déjà le tarif public
    return this.services.reduce((total, s) => total + (Number(s.price) || 0), 0);
  }

  /** Vrai si au moins une prestation bénéficie d'une remise. */
  get hasDiscount(): boolean {
    return this.pricings.some(p => p.discountPercent > 0);
  }

  get totalBasePrice(): number {
    return this.services.reduce((total, s) => total + (Number(s.price) || 0), 0);
  }

  priceLabel(price: number): string {
    return formatPrice(price);
  }

  // ==================== COMPOSITION DU RENDEZ-VOUS ====================

  /**
   * Retire une prestation. La dernière ne peut pas l'être : un rendez-vous
   * vide n'a pas de sens, et la croix du bandeau sert déjà à tout reprendre.
   */
  removeService(index: number): void {
    if (this.services.length <= 1) return;

    this.services = this.services.filter((_, i) => i !== index);
    this.persistServices();

    // La durée totale a changé : les créneaux disponibles aussi
    this.selectedTime = null;
    this.loadingDates = true;
    this.refreshPricing();
    this.loadAvailability();
  }

  /** Renvoie au choix d'une prestation à ajouter au rendez-vous. */
  addService(): void {
    this.persistServices();
    const categoryId = this.services[this.services.length - 1]?.category_id;
    this.router.navigate(categoryId ? ['/prestations', categoryId] : ['/']);
  }

  private persistServices(): void {
    this.bookingService.updateBookingState({ selectedServices: this.services });
  }

  toggleDescription(serviceId: string): void {
    if (this.openDescriptions.has(serviceId)) this.openDescriptions.delete(serviceId);
    else this.openDescriptions.add(serviceId);
  }

  isDescriptionOpen(serviceId: string): boolean {
    return this.openDescriptions.has(serviceId);
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
    return `${MOIS_LONGS[this.viewMonth]} ${this.viewYear}`;
  }

  /** « Réservation possible jusqu'au 31 août. » */
  get horizonLabel(): string {
    const fin = parseDateString(this.horizonEnd);
    return `${fin.getDate()} ${MOIS_LONGS[fin.getMonth()]}`;
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
    return this.selectedDate ? formatDayMonth(this.selectedDate) : '';
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

  /**
   * Abandonne le rendez-vous en cours et repart du choix des prestations.
   * Le retirer de l'état évite de retrouver l'ancienne sélection au retour.
   */
  clearAll(): void {
    const categoryId = this.services[0]?.category_id;
    this.bookingService.updateBookingState({
      selectedServices: [],
      selectedDate: null,
      selectedTime: null
    });
    this.router.navigate(categoryId ? ['/prestations', categoryId] : ['/']);
  }

  goBack(): void {
    this.clearAll();
  }
}
