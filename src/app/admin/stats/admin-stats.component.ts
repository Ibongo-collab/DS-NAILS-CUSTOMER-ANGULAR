import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../admin.service';
import { Booking } from '../../models/booking.model';
import { ClientRow, ClientSignup } from '../admin.service';
import { formatShortDate } from '../../utils/date';
import { formatAmount } from '../../utils/money';
import { Pagination } from '../pagination';
import {
  AccountingStats,
  ClientGrowth,
  computeAccountingStats,
  computeClientGrowth,
  LoyalClient
} from './accounting';
import { BarChartComponent } from './bar-chart.component';
import { LineChartComponent } from './line-chart.component';
import { DonutChartComponent, DonutSegment } from './donut-chart.component';

/**
 * Palette catégorielle validée pour la répartition par civilité
 * (adjacences daltonisme ΔE 14,2 · vision normale 25,5 sur fond blanc).
 * L'ordre des slots est fixe : il ne suit jamais le classement des valeurs.
 */
const GENDER_COLORS = {
  femme: '#96177F',
  homme: '#2a78d6',
  unknown: '#eda100'
} as const;

@Component({
  selector: 'app-admin-stats',
  standalone: true,
  imports: [FormsModule, BarChartComponent, LineChartComponent, DonutChartComponent],
  templateUrl: './admin-stats.component.html',
  styleUrls: ['./admin-stats.component.scss']
})
export class AdminStatsComponent implements OnInit {
  /**
   * Le super administrateur est un accès technique : les montants de chiffre
   * d'affaires lui sont masqués. C'est un choix d'interface — les données
   * restent lisibles par tout administrateur côté base.
   */
  isSuperAdmin = false;

  private destroyRef = inject(DestroyRef);

  loading = true;
  /** Rechargement à chaud : le rendu précédent reste affiché, sans saut de mise en page */
  refreshing = false;
  bookings: Booking[] = [];
  signups: ClientSignup[] = [];
  stats!: AccountingStats;
  clients!: ClientGrowth;

  // --- Annuaire clients ---
  clientList: ClientRow[] = [];
  clientSearch = '';
  clientStatus: 'all' | 'verified' | 'unverified' = 'all';
  /** Taille liée au sélecteur de l'écran ; la pagination la recopie. */
  clientPageSize = 10;
  private readonly pagination = new Pagination(this.clientPageSize);

  readonly clientStatusOptions = [
    { value: 'all' as const, label: 'Tous les comptes' },
    { value: 'verified' as const, label: 'Email vérifié' },
    { value: 'unverified' as const, label: 'En attente de confirmation' }
  ];

  readonly pageSizeOptions = [10, 25, 50];

  /** Profondeur d'historique du graphique de chiffre d'affaires */
  monthsRange = 12;
  /** Profondeur de la courbe de réservations */
  daysRange = 30;

  readonly monthOptions = [
    { value: 6, label: '6 mois' },
    { value: 12, label: '12 mois' },
    { value: 24, label: '24 mois' }
  ];

  readonly dayOptions = [
    { value: 14, label: '14 jours' },
    { value: 30, label: '30 jours' },
    { value: 90, label: '90 jours' }
  ];

  // Passés aux graphiques : liés à l'instance pour garder le `this` du composant
  readonly formatAmount = (value: number): string => this.money(value);
  readonly formatCount = (value: number): string => `${Math.round(value)}`;

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

    const [bookings, signups, clientList] = await Promise.all([
      this.adminService.getBookings(),
      this.adminService.getClientSignups(),
      this.adminService.getClients()
    ]);

    this.bookings = bookings;
    this.signups = signups;
    this.clientList = clientList;
    this.recompute();
    this.loading = false;
    this.cdr.detectChanges();
  }

  async refresh(): Promise<void> {
    this.refreshing = true;
    this.cdr.detectChanges();
    await this.load(false);
    this.refreshing = false;
    this.cdr.detectChanges();
  }

  recompute(): void {
    this.stats = computeAccountingStats(this.bookings, {
      months: this.monthsRange,
      days: this.daysRange
    });
    this.clients = computeClientGrowth(this.signups, { days: this.daysRange });
  }

  onRangeChange(): void {
    this.recompute();
    this.cdr.detectChanges();
  }

  // --- Indicateurs dérivés ---

  get monthDelta(): number | null {
    if (!this.stats) return null;
    const previous = this.stats.revenuePreviousMonth;
    if (previous === 0) return null;
    return ((this.stats.revenueCurrentMonth - previous) / previous) * 100;
  }

  get topServiceName(): string {
    return this.stats?.topServices[0]?.fullLabel || '—';
  }

  get topServiceCount(): number {
    return this.stats?.topServices[0]?.value || 0;
  }

  get peakHour(): string {
    if (!this.stats?.busiestHours.length) return '—';
    const peak = [...this.stats.busiestHours].sort((a, b) => b.value - a.value)[0];
    return peak.value > 0 ? peak.fullLabel || peak.label : '—';
  }

  get bestClient(): LoyalClient | null {
    return this.stats?.loyalClients[0] ?? null;
  }

  // --- Répartition par civilité ---

  /**
   * « Non renseigné » est une part à part entière : sans elle, le total du
   * graphique ne correspondrait pas au nombre de clients inscrits, tous les
   * comptes antérieurs à l'ajout du champ n'ayant pas de civilité.
   */
  get genderSegments(): DonutSegment[] {
    const counts = { femme: 0, homme: 0, unknown: 0 };

    for (const client of this.clientList) {
      if (client.gender === 'femme') counts.femme += 1;
      else if (client.gender === 'homme') counts.homme += 1;
      else counts.unknown += 1;
    }

    return [
      { label: 'Femmes', value: counts.femme, color: GENDER_COLORS.femme },
      { label: 'Hommes', value: counts.homme, color: GENDER_COLORS.homme },
      { label: 'Non renseigné', value: counts.unknown, color: GENDER_COLORS.unknown }
    ];
  }

  get genderKnownCount(): number {
    return this.clientList.filter(c => c.gender === 'femme' || c.gender === 'homme').length;
  }

  // --- Annuaire clients ---

  get filteredClients(): ClientRow[] {
    const term = this.clientSearch.trim().toLowerCase();

    return this.clientList.filter(client => {
      if (this.clientStatus === 'verified' && !client.email_verified) return false;
      if (this.clientStatus === 'unverified' && client.email_verified) return false;
      if (!term) return true;

      return [client.full_name, client.email, client.phone]
        .some(field => (field || '').toLowerCase().includes(term));
    });
  }

  get clientPage(): number { return this.pagination.page; }
  get clientPageCount(): number { return this.pagination.count(this.filteredClients.length); }
  get pagedClients(): ClientRow[] { return this.pagination.slice(this.filteredClients); }
  get clientRangeStart(): number { return this.pagination.start(this.filteredClients.length); }
  get clientRangeEnd(): number { return this.pagination.end(this.filteredClients.length); }

  onClientFilterChange(): void {
    // Le sélecteur de taille passe par ici : la valeur choisie doit rejoindre
    // la pagination avant que la page ne soit remise à un.
    this.pagination.pageSize = this.clientPageSize;
    this.pagination.reset();
  }

  goToPage(page: number): void {
    this.pagination.goTo(page, this.filteredClients.length);
  }

  resetClientFilters(): void {
    this.clientSearch = '';
    this.clientStatus = 'all';
    this.pagination.reset();
  }

  formatSignupDate(value: string): string {
    if (!value) return '—';
    // `slice` tolère une date seule comme un horodatage complet ; `new Date`
    // aurait lu la première en UTC et affiché la veille dans un fuseau négatif.
    return formatShortDate(String(value).slice(0, 10));
  }

  // --- Formatage ---

  money(value: number): string {
    return formatAmount(value);
  }

  percent(value: number): string {
    return `${(value || 0).toFixed(1).replace('.', ',')} %`;
  }

  signedPercent(value: number): string {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1).replace('.', ',')} %`;
  }

  formatDate(dateString: string): string {
    if (!dateString) return '—';
    return formatShortDate(dateString);
  }
}
