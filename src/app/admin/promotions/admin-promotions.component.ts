import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../admin.service';
import { Promotion, Service } from '../../models/booking.model';
import { parseDateString, todayString } from '../../utils/date';

/** Où en est une promotion par rapport à aujourd'hui. */
type PromotionState = 'running' | 'scheduled' | 'ended' | 'disabled';

interface PromotionDraft {
  name: string;
  discount_percent: number | null;
  /** '' = toutes les prestations */
  service_id: string;
  starts_on: string;
  ends_on: string;
}

@Component({
  selector: 'app-admin-promotions',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-promotions.component.html',
  styleUrls: ['./admin-promotions.component.scss']
})
export class AdminPromotionsComponent implements OnInit {
  loading = true;
  error = '';
  notice = '';

  promotions: Promotion[] = [];
  services: Service[] = [];

  creating = false;
  busyId: string | null = null;
  editingId: string | null = null;

  draft: PromotionDraft = this.emptyDraft();
  edit: PromotionDraft = this.emptyDraft();

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading = true;

    const [promotions, services] = await Promise.all([
      this.adminService.getPromotions(),
      this.adminService.getServices()
    ]);

    this.promotions = promotions;
    this.services = services;
    this.loading = false;
    this.cdr.detectChanges();
  }

  // ==================== CRÉATION ====================

  private emptyDraft(): PromotionDraft {
    return { name: '', discount_percent: null, service_id: '', starts_on: '', ends_on: '' };
  }

  /** Ce qui empêche d'enregistrer, ou '' si la saisie est complète et cohérente. */
  private problemWith(draft: PromotionDraft): string {
    const percent = Number(draft.discount_percent);

    if (!draft.name.trim()) return 'Donnez un nom à la promotion.';
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return 'La remise doit être comprise entre 1 et 100 %.';
    }
    if (!draft.starts_on || !draft.ends_on) return 'Indiquez les dates de début et de fin.';
    if (draft.ends_on < draft.starts_on) {
      return 'La date de fin doit être postérieure à la date de début.';
    }
    return '';
  }

  get canCreate(): boolean {
    return !this.problemWith(this.draft);
  }

  get canSaveEdit(): boolean {
    return !this.problemWith(this.edit);
  }

  private toPayload(draft: PromotionDraft): Partial<Promotion> {
    return {
      name: draft.name.trim(),
      discount_percent: Number(draft.discount_percent),
      // Le select renvoie '' pour « toutes les prestations » ; la base attend NULL
      service_id: draft.service_id || null,
      starts_on: draft.starts_on,
      ends_on: draft.ends_on
    };
  }

  async create(): Promise<void> {
    const problem = this.problemWith(this.draft);
    if (problem) {
      this.error = problem;
      return;
    }

    this.creating = true;
    this.error = '';
    this.notice = '';
    this.cdr.detectChanges();

    const result = await this.adminService.createPromotion(this.toPayload(this.draft));
    this.creating = false;

    if (!result.success) {
      this.error = result.error || 'La création a échoué.';
      this.cdr.detectChanges();
      return;
    }

    this.draft = this.emptyDraft();
    this.notice = 'Promotion enregistrée. Les nouveaux prix sont visibles immédiatement.';
    await this.load(false);
  }

  // ==================== MODIFICATION ====================

  startEdit(promotion: Promotion): void {
    this.editingId = promotion.id;
    this.error = '';
    this.notice = '';
    this.edit = {
      name: promotion.name,
      discount_percent: Number(promotion.discount_percent),
      service_id: promotion.service_id || '',
      starts_on: promotion.starts_on,
      ends_on: promotion.ends_on
    };
  }

  cancelEdit(): void {
    this.editingId = null;
    this.error = '';
  }

  async saveEdit(promotion: Promotion): Promise<void> {
    const problem = this.problemWith(this.edit);
    if (problem) {
      this.error = problem;
      return;
    }

    this.busyId = promotion.id;
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.adminService.updatePromotion(promotion.id, this.toPayload(this.edit));
    this.busyId = null;

    if (!result.success) {
      this.error = result.error || 'La modification a échoué.';
      this.cdr.detectChanges();
      return;
    }

    this.editingId = null;
    await this.load(false);
  }

  async toggleActive(promotion: Promotion): Promise<void> {
    this.busyId = promotion.id;
    this.error = '';
    this.notice = '';
    this.cdr.detectChanges();

    const result = await this.adminService.updatePromotion(promotion.id, {
      active: !promotion.active
    });
    this.busyId = null;

    if (!result.success) {
      this.error = result.error || 'La modification a échoué.';
      this.cdr.detectChanges();
      return;
    }
    await this.load(false);
  }

  async remove(promotion: Promotion): Promise<void> {
    const message =
      `Supprimer la promotion « ${promotion.name} » ?\n\n` +
      'Les réservations déjà prises gardent le prix qui leur a été appliqué : ' +
      'le chiffre d\'affaires passé n\'est pas modifié.';

    if (!confirm(message)) return;

    this.busyId = promotion.id;
    this.error = '';
    this.notice = '';
    this.cdr.detectChanges();

    const result = await this.adminService.deletePromotion(promotion.id);
    this.busyId = null;

    if (!result.success) {
      this.error = result.error || 'La suppression a échoué.';
      this.cdr.detectChanges();
      return;
    }
    await this.load(false);
  }

  // ==================== AFFICHAGE ====================

  state(promotion: Promotion): PromotionState {
    if (!promotion.active) return 'disabled';

    const today = this.today();
    if (today < promotion.starts_on) return 'scheduled';
    if (today > promotion.ends_on) return 'ended';
    return 'running';
  }

  stateLabel(promotion: Promotion): string {
    const labels: Record<PromotionState, string> = {
      running: 'En cours',
      scheduled: 'Programmée',
      ended: 'Terminée',
      disabled: 'Désactivée'
    };
    return labels[this.state(promotion)];
  }

  /** Nombre de promotions qui s'appliquent réellement en ce moment. */
  get runningCount(): number {
    return this.promotions.filter(p => this.state(p) === 'running').length;
  }

  scopeLabel(promotion: Promotion): string {
    if (!promotion.service_id) return 'Toutes les prestations';

    const service = this.services.find(s => s.id === promotion.service_id);
    // La prestation peut avoir été supprimée depuis
    return service ? service.name : 'Prestation supprimée';
  }

  formatPercent(value: number): string {
    // 20.00 en base doit s'afficher « 20 », mais 12.50 reste « 12,5 »
    return `${Number(value).toString().replace('.', ',')} %`;
  }

  formatDate(dateString: string): string {
    const date = parseDateString(dateString);
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  private today(): string {
    return todayString();
  }
}
