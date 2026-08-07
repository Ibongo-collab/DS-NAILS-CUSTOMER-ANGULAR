import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../admin.service';
import { Promotion, Service } from '../../models/booking.model';
import { formatShortDate, todayString } from '../../utils/date';

/** Où en est une promotion par rapport à aujourd'hui. */
type PromotionState = 'running' | 'scheduled' | 'ended' | 'disabled';

/** Portée de la remise. */
type Scope = 'all' | 'some';

interface PromotionDraft {
  name: string;
  discount_percent: number | null;
  scope: Scope;
  /** Prestations cochées ; ignoré tant que la portée est « toutes » */
  service_ids: string[];
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

  saving = false;
  busyId: string | null = null;

  /** Promotion en cours de modification, null en création */
  editingId: string | null = null;

  draft: PromotionDraft = this.emptyDraft();

  /** Filtre de la liste des prestations à cocher */
  serviceSearch = '';

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

  // ==================== FORMULAIRE ====================

  private emptyDraft(): PromotionDraft {
    return {
      name: '',
      discount_percent: null,
      scope: 'all',
      service_ids: [],
      starts_on: '',
      ends_on: ''
    };
  }

  /** Ce qui empêche d'enregistrer, ou '' si la saisie est complète. */
  private get problem(): string {
    const percent = Number(this.draft.discount_percent);

    if (!this.draft.name.trim()) return 'Donnez un nom à la promotion.';
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return 'La remise doit être comprise entre 1 et 100 %.';
    }
    if (this.draft.scope === 'some' && !this.draft.service_ids.length) {
      return 'Choisissez au moins une prestation, ou repassez sur « toutes les prestations ».';
    }
    if (!this.draft.starts_on || !this.draft.ends_on) return 'Indiquez les dates de début et de fin.';
    if (this.draft.ends_on < this.draft.starts_on) {
      return 'La date de fin doit être postérieure à la date de début.';
    }
    return '';
  }

  get canSave(): boolean {
    return !this.problem;
  }

  get formTitle(): string {
    return this.editingId ? 'Modifier la promotion' : 'Créer une promotion';
  }

  async save(): Promise<void> {
    const problem = this.problem;
    if (problem) {
      this.error = problem;
      return;
    }

    this.saving = true;
    this.error = '';
    this.notice = '';
    this.cdr.detectChanges();

    const result = await this.adminService.savePromotion(
      {
        name: this.draft.name.trim(),
        discount_percent: Number(this.draft.discount_percent),
        starts_on: this.draft.starts_on,
        ends_on: this.draft.ends_on,
        // Portée « toutes » : aucune prestation rattachée
        service_ids: this.draft.scope === 'some' ? this.draft.service_ids : []
      },
      this.editingId ?? undefined
    );

    this.saving = false;

    if (!result.success) {
      this.error = result.error || 'L\'enregistrement a échoué.';
      this.cdr.detectChanges();
      return;
    }

    this.notice = this.editingId
      ? 'Promotion modifiée.'
      : 'Promotion enregistrée. Les nouveaux prix sont visibles immédiatement.';

    this.cancelEdit();
    await this.load(false);
  }

  // ==================== CHOIX DES PRESTATIONS ====================

  /** Prestations proposées à la sélection, filtrées par la recherche. */
  get pickerServices(): Service[] {
    const term = this.serviceSearch.trim().toLowerCase();
    if (!term) return this.services;
    return this.services.filter(s => s.name.toLowerCase().includes(term));
  }

  isPicked(serviceId: string): boolean {
    return this.draft.service_ids.includes(serviceId);
  }

  togglePick(serviceId: string): void {
    this.draft.service_ids = this.isPicked(serviceId)
      ? this.draft.service_ids.filter(id => id !== serviceId)
      : [...this.draft.service_ids, serviceId];
  }

  selectAllVisible(): void {
    const visibles = this.pickerServices.map(s => s.id);
    this.draft.service_ids = [...new Set([...this.draft.service_ids, ...visibles])];
  }

  clearPicks(): void {
    this.draft.service_ids = [];
  }

  /** Remet la liste à zéro en repassant sur « toutes les prestations ». */
  onScopeChange(): void {
    if (this.draft.scope === 'all') this.draft.service_ids = [];
  }

  // ==================== MODIFICATION ====================

  startEdit(promotion: Promotion): void {
    this.editingId = promotion.id;
    this.error = '';
    this.notice = '';
    this.serviceSearch = '';

    const cibles = promotion.service_ids ?? [];
    this.draft = {
      name: promotion.name,
      discount_percent: Number(promotion.discount_percent),
      scope: cibles.length ? 'some' : 'all',
      service_ids: [...cibles],
      starts_on: promotion.starts_on,
      ends_on: promotion.ends_on
    };

    // Le formulaire est en haut de l'écran ; sans cela la modification
    // paraîtrait sans effet depuis le bas du tableau.
    document.querySelector('.promo-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  cancelEdit(): void {
    this.editingId = null;
    this.draft = this.emptyDraft();
    this.serviceSearch = '';
    this.error = '';
  }

  async toggleActive(promotion: Promotion): Promise<void> {
    this.busyId = promotion.id;
    this.error = '';
    this.notice = '';
    this.cdr.detectChanges();

    const result = await this.adminService.setPromotionActive(promotion.id, !promotion.active);
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

    if (this.editingId === promotion.id) this.cancelEdit();
    await this.load(false);
  }

  // ==================== AFFICHAGE ====================

  state(promotion: Promotion): PromotionState {
    if (!promotion.active) return 'disabled';

    const today = todayString();
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

  /** « Toutes les prestations », « Manucure », ou « 3 prestations ». */
  scopeLabel(promotion: Promotion): string {
    const cibles = promotion.service_ids ?? [];
    if (!cibles.length) return 'Toutes les prestations';
    if (cibles.length === 1) return this.serviceName(cibles[0]);
    return `${cibles.length} prestations`;
  }

  /** Détail complet, en infobulle sur les portées résumées. */
  scopeDetail(promotion: Promotion): string {
    const cibles = promotion.service_ids ?? [];
    if (cibles.length < 2) return '';
    return cibles.map(id => this.serviceName(id)).join(', ');
  }

  private serviceName(id: string): string {
    // La prestation peut avoir été supprimée depuis
    return this.services.find(s => s.id === id)?.name ?? 'Prestation supprimée';
  }

  formatPercent(value: number): string {
    // 20.00 en base doit s'afficher « 20 », mais 12.50 reste « 12,5 »
    return `${Number(value).toString().replace('.', ',')} %`;
  }

  formatDate(dateString: string): string {
    return formatShortDate(dateString);
  }
}
