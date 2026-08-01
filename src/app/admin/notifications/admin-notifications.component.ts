import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminService,
  NotificationRow,
  NotificationSettings,
  NotificationStatus
} from '../admin.service';

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

  formatMoment(value: string): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    const time = `${date.getHours()}h${String(date.getMinutes()).padStart(2, '0')}`;
    return `${date.getDate()} ${months[date.getMonth()]} · ${time}`;
  }
}
