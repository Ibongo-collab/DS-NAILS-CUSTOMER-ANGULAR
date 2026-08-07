import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { PhoneInputComponent } from '../../components/shared/phone-input/phone-input.component';
import { DurationPipe } from '../../pipes/duration.pipe';
import { AdminService, AdminStats } from '../admin.service';
import { servicesLabel } from '../booking-services';
import { Pagination } from '../pagination';
import { Booking, BookingLine, BookingStatus, Promotion, Service } from '../../models/booking.model';
import { applyDiscount, bestPromotion } from '../../services/pricing';
import { formatDayDate, todayString } from '../../utils/date';
import { formatAmount } from '../../utils/money';

type StatusFilter = BookingStatus | 'all';

/** Prestation réalisée au comptoir, reportée du cahier. */
interface ManualEntry {
  /** Prestations réalisées, dans l'ordre d'ajout. */
  service_ids: string[];
  client_name: string;
  client_phone: string;
  client_email: string;
  booking_date: string;
  start_time: string;
  discounted: boolean;
  discount_percent: number | null;
  /**
   * Montant réellement encaissé. Pré-rempli à partir du tarif, mais modifiable :
   * les prix affichés sont des prix de départ, un ajout demandé sur place les
   * fait monter.
   */
  amount: number | null;
}

@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [FormsModule, PhoneInputComponent, DurationPipe],
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

  /** Seul le super administrateur peut supprimer une réservation. */
  isSuperAdmin = false;

  /** Réservation dont la suppression est en cours de confirmation */
  bookingToDelete: Booking | null = null;
  deleteReason = '';
  deleting = false;

  private destroyRef = inject(DestroyRef);

  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'pending', label: 'En attente' },
    { value: 'confirmed', label: 'Confirmées' },
    { value: 'completed', label: 'Terminées' },
    { value: 'cancelled', label: 'Annulées' }
  ];

  // --- Saisie manuelle ---

  /** Le formulaire n'est déplié qu'à la demande : l'écran est déjà dense. */
  manualOpen = false;
  manualSaving = false;
  manualNotice = '';
  services: Service[] = [];
  private promotions: Promotion[] = [];
  manual: ManualEntry = this.emptyEntry();

  constructor(
    private adminService: AdminService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authService.isSuperAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isSuperAdmin => {
        this.isSuperAdmin = isSuperAdmin === true;
        this.cdr.detectChanges();
      });

    this.load();
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading = true;
    this.bookings = await this.adminService.getBookings();
    this.stats = this.adminService.computeStats(this.bookings);
    this.loading = false;
    this.cdr.detectChanges();
  }

  /**
   * Prestations et promotions ne servent qu'à la saisie manuelle : on ne les
   * charge qu'à l'ouverture du formulaire, pas à chaque affichage de la liste.
   */
  private async loadFormData(): Promise<void> {
    if (this.services.length) return;

    const [services, promotions] = await Promise.all([
      this.adminService.getServices(),
      this.adminService.getPromotions()
    ]);
    this.services = services;
    this.promotions = promotions;
    this.cdr.detectChanges();
  }

  // --- Pagination ---

  /** Cinq lignes par page : la liste grossit sans fin avec le temps. */
  private readonly pagination = new Pagination(5);

  get page(): number { return this.pagination.page; }
  get pageCount(): number { return this.pagination.count(this.filteredBookings.length); }
  get pagedBookings(): Booking[] { return this.pagination.slice(this.filteredBookings); }
  get rangeStart(): number { return this.pagination.start(this.filteredBookings.length); }
  get rangeEnd(): number { return this.pagination.end(this.filteredBookings.length); }

  goToPage(page: number): void {
    this.pagination.goTo(page, this.filteredBookings.length);
  }

  /** Tout changement de filtre ramène à la première page. */
  onFilterChange(): void {
    this.pagination.reset();
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

  clearDateFilter(): void {
    this.dateFilter = '';
    this.onFilterChange();
  }

  resetFilters(): void {
    this.statusFilter = 'all';
    this.dateFilter = '';
    this.search = '';
    this.onFilterChange();
  }

  canConfirm(booking: Booking): boolean {
    return booking.status === 'pending';
  }

  /**
   * Instant d'un créneau, en heure locale.
   *
   * `2026-08-04T14:30` sans indicateur de fuseau est interprété dans le fuseau
   * du navigateur : c'est bien l'heure du salon qu'on veut comparer, pas UTC.
   */
  private momentOf(date: string, time: string | undefined): number | null {
    // Date construite composant par composant plutôt qu'en concaténant une
    // chaîne : `new Date('...')` dépend du format exact reçu et bascule en UTC
    // au moindre écart, ce qui décalerait le seuil de plusieurs heures.
    const [year, month, day] = String(date || '').split('-').map(Number);
    const [hours, minutes] = String(time || '').split(':').map(Number);

    if (![year, month, day, hours, minutes].every(Number.isFinite)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
  }

  private hasStarted(booking: Booking): boolean {
    const start = this.momentOf(booking.booking_date, booking.start_time);
    return start !== null && start <= Date.now();
  }

  /** Vrai une fois la prestation terminée, heure de fin comprise. */
  private hasEnded(booking: Booking): boolean {
    // Repli sur l'heure de début si la fin manque : mieux vaut un seuil
    // approché qu'une réservation impossible à clôturer
    const end = this.momentOf(booking.booking_date, booking.end_time)
      ?? this.momentOf(booking.booking_date, booking.start_time);
    return end !== null && end <= Date.now();
  }

  /**
   * Clôturer n'a de sens qu'une fois la prestation achevée : plus tôt, elle
   * n'a pas été rendue, et la comptabiliser fausserait le chiffre d'affaires.
   *
   * Le super administrateur échappe à ce verrou : c'est un accès technique,
   * qui doit pouvoir rattraper une situation que la règle n'avait pas prévue.
   * La fenêtre de confirmation le prévient alors que l'heure n'est pas venue.
   */
  canComplete(booking: Booking): boolean {
    if (booking.status !== 'confirmed') return false;
    return this.isSuperAdmin || this.hasEnded(booking);
  }

  /** Clôture demandée avant la fin du rendez-vous — super administrateur seul. */
  get completingEarly(): boolean {
    return !!this.bookingToComplete && !this.hasEnded(this.bookingToComplete);
  }

  /**
   * Remplace le bouton tant que la prestation n'est pas achevée, en distinguant
   * ce qui n'a pas commencé de ce qui est en cours.
   */
  pendingLabel(booking: Booking): string {
    if (booking.status !== 'confirmed' || this.hasEnded(booking)) return '';
    return this.hasStarted(booking) ? 'En cours' : 'À venir';
  }

  canCancel(booking: Booking): boolean {
    return booking.status === 'pending' || booking.status === 'confirmed';
  }

  // --- Clôture d'une réservation ---

  /** Montant à comptabiliser, ajustable avant de clôturer. */
  completionAmountValue: number | null = null;

  /** Lignes du rendez-vous, avec ce qui a réellement été réalisé. */
  completionLines: { line: BookingLine; name: string; done: boolean }[] = [];

  askComplete(booking: Booking): void {
    this.bookingToComplete = booking;

    // Toutes réalisées par défaut : le cas courant, et décocher est un geste
    // délibéré.
    this.completionLines = [...(booking.booking_services ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(line => ({
        line,
        name: line.services?.name || 'Prestation supprimée',
        done: true
      }));

    // Pré-rempli au prix figé à la réservation ; à défaut, au tarif actuel
    const montant = booking.price_at_booking ?? booking.services?.price;
    this.completionAmountValue = montant === null || montant === undefined
      ? null
      : Math.round(Number(montant));

    this.error = '';
    this.cdr.detectChanges();
  }

  dismissComplete(): void {
    this.bookingToComplete = null;
    this.completionAmountValue = null;
    this.completionLines = [];
    this.cdr.detectChanges();
  }

  /** Le détail ne s'affiche que s'il y a matière à choisir. */
  get hasCompletionLines(): boolean {
    return this.completionLines.length > 1;
  }

  get keptLines(): { line: BookingLine; name: string; done: boolean }[] {
    return this.completionLines.filter(l => l.done);
  }

  /**
   * Décocher une prestation retire son montant du total proposé.
   *
   * Le champ reste ensuite modifiable : la somme des lignes n'est qu'un point
   * de départ, c'est l'encaissement réel qui fait foi.
   */
  toggleCompletionLine(index: number): void {
    const ligne = this.completionLines[index];
    if (!ligne) return;

    // La dernière ne se décoche pas : un rendez-vous sans prestation est une
    // annulation, pas une clôture.
    if (ligne.done && this.keptLines.length <= 1) return;

    ligne.done = !ligne.done;

    const somme = this.keptLines.reduce(
      (total, l) => total + Number(l.line.price_at_booking ?? 0),
      0
    );
    if (somme > 0) this.completionAmountValue = Math.round(somme);
  }

  /** Le montant retenu s'écarte-t-il de celui prévu à la réservation ? */
  get completionAmountAdjusted(): boolean {
    const booking = this.bookingToComplete;
    if (!booking || this.completionAmountValue === null) return false;
    const prevu = booking.price_at_booking ?? booking.services?.price;
    if (prevu === null || prevu === undefined) return false;
    return Number(this.completionAmountValue) !== Math.round(Number(prevu));
  }

  get canConfirmComplete(): boolean {
    const montant = Number(this.completionAmountValue);
    return this.completionAmountValue !== null && Number.isFinite(montant) && montant >= 0;
  }

  async confirmComplete(): Promise<void> {
    const booking = this.bookingToComplete;
    if (!booking?.id || !this.canConfirmComplete) return;

    const montant = Number(this.completionAmountValue);

    this.bookingToComplete = null;
    this.completionAmountValue = null;
    this.busyId = booking.id;
    this.error = '';
    this.cdr.detectChanges();

    // Liste transmise seulement si une prestation a été écartée : sinon on
    // laisse la composition telle quelle.
    const gardees = this.keptLines.map(l => l.line.service_id);
    const partielle = gardees.length > 0 && gardees.length < this.completionLines.length;

    this.completionLines = [];

    const result = await this.adminService.completeBooking(
      booking.id,
      montant,
      partielle ? gardees : undefined
    );
    this.busyId = null;

    if (!result.success) {
      this.error = result.error || 'La clôture a échoué.';
      this.cdr.detectChanges();
      return;
    }
    await this.load(false);
  }

  // --- Suppression définitive (super administrateur) ---

  askDelete(booking: Booking): void {
    this.bookingToDelete = booking;
    this.deleteReason = '';
    this.error = '';
    this.cdr.detectChanges();
  }

  dismissDelete(): void {
    this.bookingToDelete = null;
    this.deleteReason = '';
    this.cdr.detectChanges();
  }

  async confirmDelete(): Promise<void> {
    const booking = this.bookingToDelete;
    if (!booking?.id) return;

    this.deleting = true;
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.adminService.deleteBooking(booking.id, this.deleteReason);

    this.deleting = false;
    this.bookingToDelete = null;
    this.deleteReason = '';

    if (!result.success) {
      this.error = result.error || 'La suppression a échoué.';
      this.cdr.detectChanges();
      return;
    }
    await this.load(false);
  }

  /**
   * Libellé accordé à la civilité déclarée.
   * Sans compte rattaché — réservation en invité — aucune civilité n'est
   * connue : la forme épicène évite d'en supposer une.
   */
  clientLabel(booking: Booking): string {
    if (booking.client_gender === 'femme') return 'Cliente';
    if (booking.client_gender === 'homme') return 'Client';
    return 'Client(e)';
  }

  /**
   * Montant de la réservation : le tarif **figé à la réservation**, remises
   * comprises. À défaut — réservations antérieures à cette colonne — le tarif
   * actuel de la prestation, qui n'est qu'une approximation.
   */
  amount(booking: Booking): string {
    const montant = booking.price_at_booking ?? booking.services?.price;
    if (montant === null || montant === undefined) return '—';
    return formatAmount(montant);
  }

  /**
   * Vrai quand le montant affiché est le tarif actuel de la prestation, faute
   * de tarif figé. Ce n'est alors pas ce qui a été convenu avec la cliente :
   * l'écran doit le signaler plutôt que de laisser croire le contraire.
   */
  isCurrentTariff(booking: Booking): boolean {
    return (booking.price_at_booking === null || booking.price_at_booking === undefined)
      && booking.services?.price !== null
      && booking.services?.price !== undefined;
  }

  /** Montant qui sera comptabilisé, tel qu'annoncé dans la fenêtre de clôture. */
  completionAmount(booking: Booking): string {
    const montant = this.amount(booking);
    return montant === '—' ? 'montant inconnu' : montant;
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

  // ==================== SAISIE MANUELLE ====================

  /** Filtre de la liste des prestations à cocher. */
  manualServiceSearch = '';

  private emptyEntry(): ManualEntry {
    return {
      service_ids: [],
      client_name: '',
      client_phone: '',
      client_email: '',
      booking_date: this.todayIso(),
      start_time: '',
      discounted: false,
      discount_percent: null,
      amount: null
    };
  }

  /** Une prestation réalisée ne peut pas l'être à une date future. */
  get maxManualDate(): string {
    return this.todayIso();
  }

  async toggleManual(): Promise<void> {
    this.manualOpen = !this.manualOpen;
    this.error = '';
    this.manualNotice = '';

    if (!this.manualOpen) {
      this.manual = this.emptyEntry();
      return;
    }
    await this.loadFormData();
  }

  /** Prestations retenues, dans l'ordre d'ajout. */
  get manualServices(): Service[] {
    return this.manual.service_ids
      .map(id => this.services.find(s => s.id === id))
      .filter((s): s is Service => !!s);
  }

  /** Reste vrai tant qu'au moins une prestation est retenue. */
  get hasManualService(): boolean {
    return this.manual.service_ids.length > 0;
  }

  /** Prestations proposées à la sélection, filtrées par la recherche. */
  get manualPickerServices(): Service[] {
    const term = this.manualServiceSearch.trim().toLowerCase();
    if (!term) return this.services;
    return this.services.filter(s => s.name.toLowerCase().includes(term));
  }

  isManualPicked(serviceId: string): boolean {
    return this.manual.service_ids.includes(serviceId);
  }

  toggleManualPick(serviceId: string): void {
    this.manual.service_ids = this.isManualPicked(serviceId)
      ? this.manual.service_ids.filter(id => id !== serviceId)
      : [...this.manual.service_ids, serviceId];
    this.onManualTariffChange();
  }

  clearManualPicks(): void {
    this.manual.service_ids = [];
    this.onManualTariffChange();
  }

  /**
   * Promotion qui était en vigueur ce jour-là sur l'une des prestations.
   * Simple rappel : c'est le montant réellement encaissé qui fait foi, pas elle.
   * La plus forte est retenue quand plusieurs s'appliquent.
   */
  get suggestedPromotion(): Promotion | null {
    if (!this.hasManualService || !this.manual.booking_date) return null;

    return this.manual.service_ids
      .map(id => bestPromotion(this.promotions, id, this.manual.booking_date))
      .filter((p): p is Promotion => !!p)
      .reduce<Promotion | null>(
        (meilleure, p) =>
          !meilleure || Number(p.discount_percent) > Number(meilleure.discount_percent) ? p : meilleure,
        null
      );
  }

  applySuggestedPromotion(): void {
    const promotion = this.suggestedPromotion;
    if (!promotion) return;

    this.manual.discounted = true;
    this.manual.discount_percent = Number(promotion.discount_percent);
    this.onManualTariffChange();
  }

  /** Remise retenue pour le calcul : zéro tant que la case n'est pas cochée. */
  private get manualDiscount(): number {
    if (!this.manual.discounted) return 0;
    const percent = Number(this.manual.discount_percent);
    return Number.isFinite(percent) ? percent : 0;
  }

  /**
   * Ce que vaudraient les prestations au tarif affiché, remise déduite.
   * Sert de point de départ : le montant réel peut être supérieur.
   */
  get suggestedAmount(): number {
    const tarif = this.manualServices.reduce((total, s) => total + (Number(s.price) || 0), 0);
    return applyDiscount(tarif, this.manualDiscount);
  }

  /** Durée cumulée, affichée en repère à côté du montant. */
  get manualDuration(): number {
    return this.manualServices.reduce(
      (total, s) => total + (Number(s.duration_minutes) || 0), 0
    );
  }

  /** Montant qui sera comptabilisé : celui saisi. */
  get manualAmount(): number {
    const amount = Number(this.manual.amount);
    return Number.isFinite(amount) ? amount : 0;
  }

  /**
   * Le montant saisi s'écarte-t-il du tarif ? C'est le cas normal dès qu'un
   * ajout a été fait sur place — on le signale sans en faire une erreur.
   */
  get amountDiffersFromTariff(): boolean {
    return this.hasManualService && this.manualAmount !== this.suggestedAmount;
  }

  /**
   * Repropose le tarif quand la prestation ou la remise change.
   *
   * Écrase la saisie en cours, volontairement : changer de prestation rend le
   * montant précédent caduc, le conserver ferait passer le prix d'une
   * prestation pour celui d'une autre.
   */
  onManualTariffChange(): void {
    this.manual.amount = this.hasManualService ? this.suggestedAmount : null;
  }

  manualAmountLabel(amount: number): string {
    return formatAmount(amount);
  }

  /** Ce qui manque pour enregistrer, ou '' si la saisie est complète. */
  private get manualProblem(): string {
    if (!this.hasManualService) return 'Choisissez au moins une prestation réalisée.';
    if (!this.manual.client_name.trim()) return 'Indiquez le nom de la cliente ou du client.';

    // Le téléphone est la clé de rapprochement des visites : sans lui, la
    // prestation compte dans le chiffre d'affaires mais reste absente du
    // classement des clientes fidèles, faute de savoir à qui la rattacher.
    const chiffres = this.manual.client_phone.replace(/\D/g, '');
    if (!chiffres) return 'Le téléphone est obligatoire pour rattacher la prestation à une cliente.';
    if (chiffres.length < 6) return 'Ce numéro de téléphone paraît incomplet.';

    if (!this.manual.booking_date) return 'Indiquez la date de la prestation.';
    if (this.manual.booking_date > this.todayIso()) {
      return 'Une prestation réalisée ne peut pas porter une date future.';
    }
    if (!this.manual.start_time) return 'Indiquez l\'heure de la prestation.';

    if (this.manual.discounted) {
      const percent = Number(this.manual.discount_percent);
      if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
        return 'La remise doit être comprise entre 1 et 99 %.';
      }
    }

    const amount = Number(this.manual.amount);
    if (this.manual.amount === null || !Number.isFinite(amount)) {
      return 'Indiquez le montant encaissé.';
    }
    if (amount < 0) return 'Le montant encaissé ne peut pas être négatif.';

    return '';
  }

  get canSaveManual(): boolean {
    return !this.manualProblem;
  }

  async saveManual(): Promise<void> {
    const problem = this.manualProblem;
    if (problem) {
      this.error = problem;
      this.cdr.detectChanges();
      return;
    }

    this.manualSaving = true;
    this.error = '';
    this.manualNotice = '';
    this.cdr.detectChanges();

    const amount = this.manualAmount;
    const result = await this.adminService.createManualBooking({
      service_ids: this.manual.service_ids,
      client_name: this.manual.client_name,
      booking_date: this.manual.booking_date,
      start_time: this.manual.start_time,
      discount_percent: this.manualDiscount,
      amount: this.manualAmount,
      client_phone: this.manual.client_phone.trim(),
      client_email: this.manual.client_email.trim(),
      notes: 'Prestation enregistrée manuellement (réservation sur place).'
    });

    this.manualSaving = false;

    if (!result.success) {
      this.error = result.error || 'L\'enregistrement a échoué.';
      this.cdr.detectChanges();
      return;
    }

    this.manualNotice =
      `Prestation enregistrée : ${this.manualAmountLabel(amount)} ajoutés au chiffre d'affaires.`;
    this.manual = this.emptyEntry();
    await this.load(false);
  }

  private todayIso(): string {
    return todayString();
  }

  /** « Nattes collées + Manucure » pour un rendez-vous à plusieurs prestations. */
  servicesLabel(booking: Booking): string {
    return servicesLabel(booking);
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
    return formatDayDate(dateString);
  }

  formatTime(time: string): string {
    return (time || '').slice(0, 5);
  }
}
