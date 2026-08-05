import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { AdminService } from '../admin.service';
import { BlockedSlot, Booking, OpeningHours } from '../../models/booking.model';
import { parseDateString, toDateString, todayString } from '../../utils/date';
import { Positioned, layoutDay, toMinutes } from './layout';

/** Bornes de la grille quand les horaires d'ouverture sont illisibles. */
const HEURE_DEBUT_PAR_DEFAUT = 8 * 60;
const HEURE_FIN_PAR_DEFAUT = 20 * 60;

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * Un rendez-vous et sa place dans la colonne du jour.
 *
 * Les valeurs de position sont calculées une fois, au montage de la semaine,
 * plutôt que lues par des appels de méthode depuis le gabarit : ceux-ci
 * seraient rejoués à chaque cycle de détection de changement.
 */
export interface PlanningBooking {
  booking: Booking;
  top: number;
  height: number;
  left: number;
  width: number;
}

export interface PlanningDay {
  date: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  closed: boolean;
  bookings: PlanningBooking[];
  /** Indisponibilités posées par le salon, en bandes grises */
  blocked: { top: number; height: number; reason: string | null }[];
}

@Component({
  selector: 'app-admin-planning',
  standalone: true,
  imports: [],
  templateUrl: './admin-planning.component.html',
  styleUrls: ['./admin-planning.component.scss']
})
export class AdminPlanningComponent implements OnInit {
  loading = true;
  days: PlanningDay[] = [];
  hourLabels: { label: string; top: number }[] = [];

  /** Lundi de la semaine affichée */
  weekStart = '';

  /** Rendez-vous ouvert dans le panneau de détail */
  selected: Booking | null = null;

  private bookings: Booking[] = [];
  private blockedSlots: BlockedSlot[] = [];
  private openingHours: OpeningHours[] = [];

  private dayStart = HEURE_DEBUT_PAR_DEFAUT;
  private dayEnd = HEURE_FIN_PAR_DEFAUT;

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.weekStart = this.mondayOf(todayString());
    this.load();
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading = true;

    const [bookings, blocked, hours] = await Promise.all([
      this.adminService.getBookings(),
      this.adminService.getBlockedSlots(),
      this.adminService.getOpeningHours()
    ]);

    this.bookings = bookings;
    this.blockedSlots = blocked;
    this.openingHours = hours;

    this.computeRange();
    this.buildWeek();
    this.loading = false;
    this.cdr.detectChanges();
  }

  // ==================== GRILLE HORAIRE ====================

  /**
   * Amplitude de la grille : de la plus petite heure d'ouverture à la plus
   * grande heure de fermeture. Élargie si un rendez-vous déborde — un
   * rendez-vous hors plage doit rester visible, pas disparaître de la vue.
   */
  private computeRange(): void {
    let debut = Infinity;
    let fin = -Infinity;

    for (const jour of this.openingHours) {
      if (jour.is_closed) continue;
      const d = toMinutes(jour.start_time);
      const f = toMinutes(jour.end_time);
      if (d !== null) debut = Math.min(debut, d);
      if (f !== null) fin = Math.max(fin, f);
    }

    if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin <= debut) {
      debut = HEURE_DEBUT_PAR_DEFAUT;
      fin = HEURE_FIN_PAR_DEFAUT;
    }

    for (const booking of this.bookings) {
      if (booking.status === 'cancelled') continue;
      const d = toMinutes(booking.start_time);
      const f = toMinutes(booking.end_time);
      if (d !== null) debut = Math.min(debut, d);
      if (f !== null) fin = Math.max(fin, f);
    }

    // On arrondit à l'heure pleine pour que les repères tombent juste
    this.dayStart = Math.floor(debut / 60) * 60;
    this.dayEnd = Math.ceil(fin / 60) * 60;

    this.hourLabels = [];
    for (let m = this.dayStart; m <= this.dayEnd; m += 60) {
      this.hourLabels.push({
        label: `${String(Math.floor(m / 60)).padStart(2, '0')}:00`,
        top: this.percent(m)
      });
    }
  }

  /**
   * Hauteur de la grille, en pixels : une heure d'ouverture vaut 58 px.
   *
   * Calculée ici et non figée en CSS — l'amplitude dépend des horaires du
   * salon, qui sont modifiables depuis l'onglet Horaires.
   */
  get gridHeight(): number {
    return ((this.dayEnd - this.dayStart) / 60) * 58;
  }

  /** Position verticale d'un horaire, en pourcentage de la hauteur du jour. */
  private percent(minutes: number): number {
    const total = this.dayEnd - this.dayStart;
    if (total <= 0) return 0;
    return ((minutes - this.dayStart) / total) * 100;
  }

  // ==================== SEMAINE ====================

  /** Lundi de la semaine contenant cette date. */
  private mondayOf(dateString: string): string {
    const date = parseDateString(dateString);
    // getDay() : 0 = dimanche. Le lundi est donc à -(jour + 6) % 7
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return toDateString(date);
  }

  private dayOffset(offset: number): string {
    const date = parseDateString(this.weekStart);
    date.setDate(date.getDate() + offset);
    return toDateString(date);
  }

  private buildWeek(): void {
    const today = todayString();

    // Un seul regroupement par date plutôt qu'un filtre par jour
    const parDate = new Map<string, Booking[]>();
    for (const booking of this.bookings) {
      // Une réservation annulée libère son créneau : la montrer laisserait
      // croire que l'horaire est pris.
      if (booking.status === 'cancelled') continue;
      const key = String(booking.booking_date).slice(0, 10);
      if (!parDate.has(key)) parDate.set(key, []);
      parDate.get(key)!.push(booking);
    }

    const horairesParJour = new Map<number, OpeningHours>();
    for (const h of this.openingHours) horairesParJour.set(h.day_of_week, h);

    this.days = [];

    for (let i = 0; i < 7; i++) {
      const date = this.dayOffset(i);
      const jourIso = i + 1; // le tableau démarre au lundi

      const placed = layoutDay(parDate.get(date) ?? [], booking => ({
        start: toMinutes(booking.start_time) ?? this.dayStart,
        end: toMinutes(booking.end_time) ?? (toMinutes(booking.start_time) ?? this.dayStart) + 30
      })).map(p => this.position(p));

      const blocked = this.blockedSlots
        .filter(slot => String(slot.date).slice(0, 10) === date)
        .map(slot => {
          const d = toMinutes(slot.start_time) ?? this.dayStart;
          const f = toMinutes(slot.end_time) ?? this.dayEnd;
          return {
            top: this.percent(d),
            height: Math.max(this.percent(f) - this.percent(d), 1),
            reason: slot.reason
          };
        });

      const parsed = parseDateString(date);

      this.days.push({
        date,
        dayName: JOURS[i],
        dayNumber: parsed.getDate(),
        isToday: date === today,
        closed: horairesParJour.get(jourIso)?.is_closed === true,
        bookings: placed,
        blocked
      });
    }
  }

  previousWeek(): void {
    this.weekStart = this.shiftWeek(-7);
    this.buildWeek();
  }

  nextWeek(): void {
    this.weekStart = this.shiftWeek(7);
    this.buildWeek();
  }

  goToday(): void {
    this.weekStart = this.mondayOf(todayString());
    this.buildWeek();
  }

  private shiftWeek(days: number): string {
    const date = parseDateString(this.weekStart);
    date.setDate(date.getDate() + days);
    return toDateString(date);
  }

  get isCurrentWeek(): boolean {
    return this.weekStart === this.mondayOf(todayString());
  }

  /** « 3 – 9 août 2026 », ou « 31 août – 6 septembre 2026 » à cheval. */
  get weekLabel(): string {
    const debut = parseDateString(this.weekStart);
    const fin = parseDateString(this.dayOffset(6));

    const memeMois = debut.getMonth() === fin.getMonth();
    const memeAnnee = debut.getFullYear() === fin.getFullYear();

    const gauche = memeMois && memeAnnee
      ? `${debut.getDate()}`
      : `${debut.getDate()} ${MOIS[debut.getMonth()]}${memeAnnee ? '' : ' ' + debut.getFullYear()}`;

    return `${gauche} – ${fin.getDate()} ${MOIS[fin.getMonth()]} ${fin.getFullYear()}`;
  }

  // ==================== BLOCS ====================

  /** Place un rendez-vous dans la colonne, chevauchements pris en compte. */
  private position(placed: Positioned<Booking>): PlanningBooking {
    const largeur = 100 / placed.columns;
    return {
      booking: placed.item,
      top: this.percent(placed.start),
      // Un minimum de hauteur : sous 30 minutes le texte ne tiendrait pas
      height: Math.max(this.percent(placed.end) - this.percent(placed.start), 2.2),
      left: placed.column * largeur,
      // Une marge à droite sépare deux rendez-vous côte à côte
      width: largeur - (placed.columns > 1 ? 1.5 : 0.5)
    };
  }

  hourRange(booking: Booking): string {
    return `${this.shortTime(booking.start_time)} – ${this.shortTime(booking.end_time)}`;
  }

  shortTime(time: string | undefined): string {
    return String(time ?? '').slice(0, 5);
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

  /**
   * Libellé accordé à la civilité déclarée. Sans compte rattaché — réservation
   * en invité — la forme épicène évite d'en supposer une.
   */
  clientLabel(booking: Booking): string {
    if (booking.client_gender === 'femme') return 'Cliente';
    if (booking.client_gender === 'homme') return 'Client';
    return 'Client(e)';
  }

  amount(booking: Booking): string {
    const montant = booking.price_at_booking ?? booking.services?.price;
    if (montant === null || montant === undefined) return '—';
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
      Math.round(Number(montant))
    )} FCFA`;
  }

  formatDate(dateString: string): string {
    const date = parseDateString(dateString);
    return `${JOURS[(date.getDay() + 6) % 7].toLowerCase()} ${date.getDate()} ${MOIS[date.getMonth()]}`;
  }

  /** Nombre de rendez-vous de la semaine affichée. */
  get weekCount(): number {
    return this.days.reduce((total, day) => total + day.bookings.length, 0);
  }

  open(booking: Booking): void {
    this.selected = booking;
  }

  close(): void {
    this.selected = null;
  }
}
