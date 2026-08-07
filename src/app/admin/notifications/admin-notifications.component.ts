import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminService,
  NotificationRow,
  NotificationSettings,
  NotificationStatus
} from '../admin.service';
import { MOIS_COURTS } from '../../utils/date';
import { Pagination } from '../pagination';

type StatusFilter = NotificationStatus | 'all';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-notifications.component.html',
  styleUrls: ['./admin-notifications.component.scss']
})
export class AdminNotificationsComponent implements OnInit {
  loading = true;
  error = '';
  success = '';

  notifications: NotificationRow[] = [];
  settings: NotificationSettings | null = null;

  adminPhone = '';
  savingSettings = false;

  statusFilter: StatusFilter = 'all';
  audienceFilter: 'all' | 'admin' | 'client' = 'all';

  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Tous les états' },
    { value: 'queued', label: 'En attente d\'envoi' },
    { value: 'simulated', label: 'Simulé' },
    { value: 'sent', label: 'Envoyé' },
    { value: 'failed', label: 'Échec' },
    { value: 'skipped', label: 'Ignoré' }
  ];

  /** Libellés des événements, pour ne pas exposer les clés techniques. */
  private readonly eventLabels: Record<string, string> = {
    booking_created: 'Nouvelle réservation',
    booking_confirmed: 'Réservation confirmée',
    booking_cancelled_by_client: 'Annulation par la cliente',
    booking_cancelled_by_admin: 'Annulation par le salon',
    booking_reminder: 'Rappel 24 h'
  };

  private readonly statusLabels: Record<NotificationStatus, string> = {
    queued: 'En attente',
    sent: 'Envoyé',
    failed: 'Échec',
    simulated: 'Simulé',
    skipped: 'Ignoré'
  };

  constructor(
    private adminService: AdminService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.load();
  }

  private applyState(mutate: () => void): void {
    this.zone.run(() => {
      mutate();
      this.cdr.detectChanges();
    });
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.applyState(() => { this.loading = true; });

    const [notifications, settings] = await Promise.all([
      this.adminService.getNotifications(),
      this.adminService.getNotificationSettings()
    ]);

    this.applyState(() => {
      this.notifications = notifications;
      this.settings = settings;
      this.adminPhone = settings?.admin_phone ?? '';
      this.loading = false;
    });
  }

  // --- Réglages ---

  get providerPending(): boolean {
    // Tant qu'aucun envoi réel n'a eu lieu, l'écran doit dire pourquoi
    return !this.notifications.some(n => n.status === 'sent');
  }

  get phoneDirty(): boolean {
    return this.adminPhone.trim() !== (this.settings?.admin_phone ?? '').trim();
  }

  async saveSettings(changes: Partial<NotificationSettings>): Promise<void> {
    this.applyState(() => {
      this.savingSettings = true;
      this.error = '';
      this.success = '';
    });

    const result = await this.adminService.updateNotificationSettings(changes);

    if (!result.success) {
      this.applyState(() => {
        this.savingSettings = false;
        this.error = result.error || 'L\'enregistrement a échoué.';
      });
      return;
    }

    this.applyState(() => {
      this.savingSettings = false;
      this.success = 'Réglages enregistrés.';
    });
    await this.load(false);
  }

  savePhone(): void {
    if (!this.phoneDirty) return;
    this.saveSettings({ admin_phone: this.adminPhone.trim() || null });
  }

  toggleAudience(audience: 'admin' | 'client'): void {
    if (!this.settings) return;
    const key = audience === 'admin' ? 'notify_admin' : 'notify_client';
    this.saveSettings({ [key]: !this.settings[key] } as Partial<NotificationSettings>);
  }

  // --- Journal ---

  get filtered(): NotificationRow[] {
    return this.notifications.filter(n => {
      if (this.statusFilter !== 'all' && n.status !== this.statusFilter) return false;
      if (this.audienceFilter !== 'all' && n.audience !== this.audienceFilter) return false;
      return true;
    });
  }

  // --- Pagination ---
  // Le journal ne se purge pas : il grandit à chaque réservation.

  /** Cinq lignes, comme le tableau des réservations. */
  private readonly pagination = new Pagination(5);

  get page(): number { return this.pagination.page; }
  get pageCount(): number { return this.pagination.count(this.filtered.length); }
  get pagedNotifications(): NotificationRow[] { return this.pagination.slice(this.filtered); }
  get rangeStart(): number { return this.pagination.start(this.filtered.length); }
  get rangeEnd(): number { return this.pagination.end(this.filtered.length); }

  goToPage(page: number): void {
    this.pagination.goTo(page, this.filtered.length);
  }

  /** Tout changement de filtre ramène à la première page. */
  onFilterChange(): void {
    this.pagination.reset();
  }

  get pendingCount(): number {
    return this.notifications.filter(n => n.status === 'queued').length;
  }

  eventLabel(event: string): string {
    return this.eventLabels[event] || event;
  }

  statusLabel(status: NotificationStatus): string {
    return this.statusLabels[status] || status;
  }

  audienceLabel(audience: string): string {
    return audience === 'admin' ? 'Salon' : 'Cliente';
  }

  /**
   * « 7 août · 14h30 ». `value` est un horodatage complet, pas une date de
   * calendrier : `new Date` est ici le bon outil, il rend l'heure locale.
   */
  formatMoment(value: string): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const time = `${date.getHours()}h${String(date.getMinutes()).padStart(2, '0')}`;
    return `${date.getDate()} ${MOIS_COURTS[date.getMonth()]} · ${time}`;
  }
}
