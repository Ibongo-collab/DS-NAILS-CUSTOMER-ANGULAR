import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../admin.service';
import { Service, ServiceCategory } from '../../models/booking.model';
import { IconComponent } from '../../components/shared/icon/icon.component';

interface ServiceDraft {
  name: string;
  /** Saisie séparée ; la base reçoit le total en minutes */
  hours: number | null;
  minutes: number | null;
  price: number | null;
  description: string;
  categoryId: string | null;
}

/** Photo en cours de sélection, avec son aperçu local. */
interface ImagePick {
  file: File | null;
  preview: string | null;
}

@Component({
  selector: 'app-admin-services',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './admin-services.component.html',
  styleUrls: ['./admin-services.component.scss']
})
export class AdminServicesComponent implements OnInit {
  loading = true;
  error = '';
  services: Service[] = [];

  busyId: string | null = null;
  creating = false;

  editingId: string | null = null;
  editDraft: ServiceDraft = this.emptyDraft();
  newDraft: ServiceDraft = this.emptyDraft();

  newImage: ImagePick = { file: null, preview: null };
  editImage: ImagePick = { file: null, preview: null };
  /** Photo déjà en ligne de la prestation en cours d'édition */
  editCurrentImageUrl: string | null = null;

  readonly maxImageMb = 5;
  readonly imageAccept = AdminService.IMAGE_ACCEPT;

  /** Survol d'un fichier au-dessus de la zone de dépôt */
  draggingNew = false;
  draggingEdit = false;

  // --- Catégories ---
  categories: ServiceCategory[] = [];
  newCategoryName = '';
  creatingCategory = false;
  editingCategoryId: string | null = null;
  categoryDraftName = '';
  busyCategoryId: string | null = null;

  /** Catégorie survolée pendant un glisser-déposer de prestation */
  dropTargetId: string | null | undefined = undefined;
  /** Prestation en cours de déplacement */
  draggedServiceId: string | null = null;

  // --- Sélecteur multiple ---
  /** Catégorie dont on gère le contenu ; null = sélecteur fermé */
  pickerCategory: ServiceCategory | null = null;
  pickerSelection = new Set<string>();
  pickerSearch = '';
  savingPicker = false;

  constructor(
    private adminService: AdminService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.load();
  }

  private emptyDraft(): ServiceDraft {
    return { name: '', hours: null, minutes: null, price: null, description: '', categoryId: null };
  }

  /** Combine les deux champs en un total de minutes, seul format stocké. */
  totalMinutes(draft: ServiceDraft): number {
    const hours = Math.max(Number(draft.hours) || 0, 0);
    const minutes = Math.max(Number(draft.minutes) || 0, 0);
    return hours * 60 + minutes;
  }

  private isDurationValid(draft: ServiceDraft): boolean {
    const minutes = Number(draft.minutes) || 0;
    // Au-delà de 59, c'est une heure qu'il faut saisir dans le champ voisin
    if (minutes > 59) return false;
    return this.totalMinutes(draft) > 0;
  }

  /** Aperçu « 1 h 30 » affiché sous les champs de saisie. */
  durationLabel(draft: ServiceDraft): string {
    const total = this.totalMinutes(draft);
    if (total <= 0) return '';
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m}`;
  }

  // --- Sélection d'une photo ---

  /**
   * Valide le fichier et construit un aperçu local.
   * L'aperçu passe par une URL d'objet : rien n'est envoyé au serveur tant que
   * le formulaire n'est pas soumis.
   */
  private pickImage(target: ImagePick, input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    if (!file) return;

    this.acceptFile(target, file);

    // Réinitialisé pour que resélectionner le même fichier relance l'événement
    input.value = '';
  }

  onNewImageSelected(event: Event): void {
    this.pickImage(this.newImage, event.target as HTMLInputElement);
  }

  onEditImageSelected(event: Event): void {
    this.pickImage(this.editImage, event.target as HTMLInputElement);
  }

  // --- Glisser-déposer ---

  onDragOver(event: DragEvent, which: 'new' | 'edit'): void {
    // Sans preventDefault, le navigateur ouvre le fichier dans un nouvel onglet
    event.preventDefault();
    if (which === 'new') this.draggingNew = true;
    else this.draggingEdit = true;
  }

  onDragLeave(event: DragEvent, which: 'new' | 'edit'): void {
    event.preventDefault();
    if (which === 'new') this.draggingNew = false;
    else this.draggingEdit = false;
  }

  onDrop(event: DragEvent, which: 'new' | 'edit'): void {
    event.preventDefault();
    this.draggingNew = false;
    this.draggingEdit = false;

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    this.acceptFile(which === 'new' ? this.newImage : this.editImage, file);
  }

  /** Valide puis retient un fichier, quelle que soit sa provenance. */
  private acceptFile(target: ImagePick, file: File): void {
    const invalid = this.adminService.validateImage(file);
    if (invalid) {
      this.applyState(() => { this.error = invalid; });
      return;
    }

    this.applyState(() => {
      this.error = '';
      this.releasePreview(target);
      target.file = file;
      target.preview = URL.createObjectURL(file);
    });
  }

  /** Nom du fichier retenu, pour l'afficher sous l'aperçu. */
  fileLabel(target: ImagePick): string {
    if (!target.file) return '';
    const size = (target.file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
    return `${target.file.name} · ${size} Mo`;
  }

  clearNewImage(): void {
    this.releasePreview(this.newImage);
    this.newImage = { file: null, preview: null };
  }

  clearEditImage(): void {
    this.releasePreview(this.editImage);
    this.editImage = { file: null, preview: null };
  }

  /** Libère l'URL d'objet, sinon le fichier reste en mémoire jusqu'au rechargement. */
  private releasePreview(target: ImagePick): void {
    if (target.preview) URL.revokeObjectURL(target.preview);
  }

  /**
   * Applique une mise à jour d'état et repeint immédiatement.
   *
   * Les appels Supabase peuvent reprendre hors de la zone Angular (API Web
   * Locks côté auth, promesses natives côté storage) : sans ce passage
   * explicite par la zone, l'écran ne se rafraîchit qu'à l'interaction suivante.
   */
  private applyState(mutate: () => void): void {
    this.zone.run(() => {
      mutate();
      this.cdr.detectChanges();
    });
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.applyState(() => { this.loading = true; });

    const [services, categories] = await Promise.all([
      this.adminService.getServices(),
      this.adminService.getCategories()
    ]);

    this.applyState(() => {
      this.services = services;
      this.categories = categories;
      this.loading = false;
    });
  }

  // ==================== CATÉGORIES ====================

  categoryName(id: string | null | undefined): string {
    if (!id) return 'Non classée';
    return this.categories.find(c => c.id === id)?.name ?? 'Non classée';
  }

  servicesInCategory(id: string | null): Service[] {
    return this.services.filter(s => (s.category_id ?? null) === id);
  }

  get uncategorizedCount(): number {
    return this.servicesInCategory(null).length;
  }

  async createCategory(): Promise<void> {
    const name = this.newCategoryName.trim();
    if (!name || this.creatingCategory) return;

    this.applyState(() => {
      this.creatingCategory = true;
      this.error = '';
    });

    const result = await this.adminService.createCategory(name);

    if (!result.success) {
      this.applyState(() => {
        this.creatingCategory = false;
        this.error = result.error || 'La création a échoué.';
      });
      return;
    }

    this.applyState(() => {
      this.creatingCategory = false;
      this.newCategoryName = '';
    });
    await this.load(false);
  }

  startCategoryEdit(category: ServiceCategory): void {
    this.editingCategoryId = category.id;
    this.categoryDraftName = category.name;
    this.error = '';
  }

  cancelCategoryEdit(): void {
    this.editingCategoryId = null;
    this.categoryDraftName = '';
  }

  async saveCategory(category: ServiceCategory): Promise<void> {
    const name = this.categoryDraftName.trim();
    if (!name || name === category.name) {
      this.cancelCategoryEdit();
      return;
    }

    this.applyState(() => {
      this.busyCategoryId = category.id;
      this.error = '';
    });

    const result = await this.adminService.renameCategory(category.id, name);

    if (!result.success) {
      this.applyState(() => {
        this.busyCategoryId = null;
        this.error = result.error || 'Le renommage a échoué.';
      });
      return;
    }

    this.applyState(() => {
      this.busyCategoryId = null;
      this.editingCategoryId = null;
    });
    await this.load(false);
  }

  async removeCategory(category: ServiceCategory): Promise<void> {
    const attached = this.servicesInCategory(category.id).length;
    const warning = attached
      ? `\n\n${attached} prestation(s) y sont rattachées : elles ne seront pas supprimées, `
        + 'mais deviendront « Non classée ».'
      : '';

    if (!confirm(`Supprimer la catégorie « ${category.name} » ?${warning}`)) return;

    this.applyState(() => {
      this.busyCategoryId = category.id;
      this.error = '';
    });

    const result = await this.adminService.deleteCategory(category.id);

    if (!result.success) {
      this.applyState(() => {
        this.busyCategoryId = null;
        this.error = result.error || 'La suppression a échoué.';
      });
      return;
    }

    this.applyState(() => { this.busyCategoryId = null; });
    await this.load(false);
  }

  // ==================== AFFECTATION ====================

  /** Rattache une prestation à une catégorie, ou l'en détache si `categoryId` est null. */
  async assignCategory(service: Service, categoryId: string | null): Promise<void> {
    if ((service.category_id ?? null) === categoryId) return;

    this.applyState(() => {
      this.busyId = service.id;
      this.error = '';
    });

    const result = await this.adminService.updateService(service.id, { category_id: categoryId });

    if (!result.success) {
      this.applyState(() => {
        this.busyId = null;
        this.error = result.error || 'L\'affectation a échoué.';
      });
      return;
    }

    this.applyState(() => { this.busyId = null; });
    await this.load(false);
  }

  // ==================== SÉLECTEUR MULTIPLE ====================

  openPicker(category: ServiceCategory): void {
    this.pickerCategory = category;
    this.pickerSearch = '';
    // Pré-cochées : les prestations déjà dans la catégorie. Décocher l'une
    // d'elles l'en retire — le sélecteur gère le contenu, pas seulement l'ajout.
    this.pickerSelection = new Set(
      this.servicesInCategory(category.id).map(s => s.id)
    );
    this.error = '';
  }

  closePicker(): void {
    this.pickerCategory = null;
    this.pickerSelection.clear();
    this.pickerSearch = '';
  }

  get pickerServices(): Service[] {
    const term = this.pickerSearch.trim().toLowerCase();
    return this.services.filter(s => !term || s.name.toLowerCase().includes(term));
  }

  isPicked(serviceId: string): boolean {
    return this.pickerSelection.has(serviceId);
  }

  togglePick(serviceId: string): void {
    if (this.pickerSelection.has(serviceId)) this.pickerSelection.delete(serviceId);
    else this.pickerSelection.add(serviceId);
  }

  /** Catégorie actuelle d'une prestation, pour signaler un déplacement. */
  currentCategoryOf(service: Service): ServiceCategory | null {
    if (!service.category_id) return null;
    return this.categories.find(c => c.id === service.category_id) ?? null;
  }

  /** Vrai si cocher cette prestation la retirera d'une autre catégorie. */
  movesFromOther(service: Service): boolean {
    if (!this.pickerCategory) return false;
    return !!service.category_id && service.category_id !== this.pickerCategory.id;
  }

  /** Nombre de prestations qui changeront de catégorie si l'on valide. */
  get pickerMoveCount(): number {
    if (!this.pickerCategory) return 0;
    return this.services.filter(
      s => this.pickerSelection.has(s.id) && this.movesFromOther(s)
    ).length;
  }

  async savePicker(): Promise<void> {
    const category = this.pickerCategory;
    if (!category || this.savingPicker) return;

    // Deux mouvements : ce qui entre dans la catégorie, ce qui en sort
    const toAttach = this.services.filter(
      s => this.pickerSelection.has(s.id) && s.category_id !== category.id
    );
    const toDetach = this.services.filter(
      s => !this.pickerSelection.has(s.id) && s.category_id === category.id
    );

    if (!toAttach.length && !toDetach.length) {
      this.closePicker();
      return;
    }

    this.applyState(() => {
      this.savingPicker = true;
      this.error = '';
    });

    const results = await Promise.all([
      ...toAttach.map(s => this.adminService.updateService(s.id, { category_id: category.id })),
      ...toDetach.map(s => this.adminService.updateService(s.id, { category_id: null }))
    ]);

    const failed = results.find(r => !r.success);

    this.applyState(() => {
      this.savingPicker = false;
      if (failed) this.error = failed.error || 'Certaines affectations ont échoué.';
      else this.closePicker();
    });

    await this.load(false);
  }

  // --- Glisser-déposer d'une prestation vers une catégorie ---

  onServiceDragStart(event: DragEvent, service: Service): void {
    this.draggedServiceId = service.id;
    event.dataTransfer?.setData('text/plain', service.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onServiceDragEnd(): void {
    this.applyState(() => {
      this.draggedServiceId = null;
      this.dropTargetId = undefined;
    });
  }

  onCategoryDragOver(event: DragEvent, categoryId: string | null): void {
    // Sans preventDefault, le navigateur refuse le dépôt
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropTargetId = categoryId;
  }

  onCategoryDragLeave(categoryId: string | null): void {
    if (this.dropTargetId === categoryId) this.dropTargetId = undefined;
  }

  async onCategoryDrop(event: DragEvent, categoryId: string | null): Promise<void> {
    event.preventDefault();

    const serviceId = event.dataTransfer?.getData('text/plain') || this.draggedServiceId;
    this.applyState(() => {
      this.dropTargetId = undefined;
      this.draggedServiceId = null;
    });

    const service = this.services.find(s => s.id === serviceId);
    if (service) await this.assignCategory(service, categoryId);
  }

  // --- Création ---

  get canCreate(): boolean {
    return (
      this.newDraft.name.trim().length > 0 &&
      !!this.newDraft.categoryId &&
      this.isDurationValid(this.newDraft) &&
      this.newDraft.price !== null &&
      this.newDraft.price >= 0
    );
  }

  async create(): Promise<void> {
    if (!this.canCreate) return;

    this.applyState(() => {
      this.creating = true;
      this.error = '';
    });

    let imageUrl: string | null = null;
    if (this.newImage.file) {
      const upload = await this.adminService.uploadServiceImage(this.newImage.file);
      if (upload.error) {
        this.applyState(() => {
          this.creating = false;
          this.error = upload.error!;
        });
        return;
      }
      imageUrl = upload.url ?? null;
    }

    const result = await this.adminService.createService({
      name: this.newDraft.name.trim(),
      duration_minutes: this.totalMinutes(this.newDraft),
      price: Number(this.newDraft.price),
      description: this.newDraft.description.trim() || null,
      category_id: this.newDraft.categoryId,
      image_url: imageUrl,
      active: true
    });

    if (!result.success) {
      this.applyState(() => {
        this.creating = false;
        this.error = result.error || 'La création a échoué.';
      });
      // La prestation n'a pas été créée : l'image téléversée n'a plus d'usage
      void this.adminService.deleteServiceImage(imageUrl);
      return;
    }

    this.applyState(() => {
      this.creating = false;
      this.newDraft = this.emptyDraft();
      this.clearNewImage();
    });

    await this.load(false);
  }

  // --- Édition ---

  startEdit(service: Service): void {
    this.editingId = service.id;
    this.editDraft = {
      name: service.name,
      hours: Math.floor(service.duration_minutes / 60) || null,
      minutes: service.duration_minutes % 60 || null,
      price: service.price,
      description: service.description || '',
      categoryId: service.category_id ?? null
    };
    this.editCurrentImageUrl = service.image_url ?? null;
    this.clearEditImage();
    this.error = '';
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editDraft = this.emptyDraft();
    this.editCurrentImageUrl = null;
    this.clearEditImage();
  }

  get canSaveEdit(): boolean {
    return (
      this.editDraft.name.trim().length > 0 &&
      this.isDurationValid(this.editDraft) &&
      this.editDraft.price !== null &&
      this.editDraft.price >= 0
    );
  }

  async saveEdit(service: Service): Promise<void> {
    if (!this.canSaveEdit) return;

    this.applyState(() => {
      this.busyId = service.id;
      this.error = '';
    });

    const previousImage = service.image_url ?? null;
    let imageUrl = previousImage;

    if (this.editImage.file) {
      const upload = await this.adminService.uploadServiceImage(this.editImage.file);
      if (upload.error) {
        this.applyState(() => {
          this.busyId = null;
          this.error = upload.error!;
        });
        return;
      }
      imageUrl = upload.url ?? null;
    }

    const result = await this.adminService.updateService(service.id, {
      name: this.editDraft.name.trim(),
      duration_minutes: this.totalMinutes(this.editDraft),
      price: Number(this.editDraft.price),
      description: this.editDraft.description.trim() || null,
      category_id: this.editDraft.categoryId,
      image_url: imageUrl
    });

    if (!result.success) {
      this.applyState(() => {
        this.busyId = null;
        this.error = result.error || 'La modification a échoué.';
      });
      // L'enregistrement a échoué : la nouvelle image n'est rattachée à rien
      if (imageUrl !== previousImage) void this.adminService.deleteServiceImage(imageUrl);
      return;
    }

    // On rend la main tout de suite : la ligne se referme dès que la base a
    // confirmé, sans attendre le ménage ni le rechargement de la liste.
    this.applyState(() => {
      this.busyId = null;
      this.editingId = null;
      this.editCurrentImageUrl = null;
      this.clearEditImage();
    });

    // Ménage en arrière-plan : l'ancienne photo n'a plus d'usage, mais
    // l'administrateur n'a aucune raison d'attendre sa suppression.
    if (imageUrl !== previousImage) void this.adminService.deleteServiceImage(previousImage);

    await this.load(false);
  }

  // --- Activation / suppression ---

  async toggleActive(service: Service): Promise<void> {
    this.applyState(() => {
      this.busyId = service.id;
      this.error = '';
    });

    const result = await this.adminService.updateService(service.id, { active: !service.active });

    if (!result.success) {
      this.applyState(() => {
        this.busyId = null;
        this.error = result.error || 'La modification a échoué.';
      });
      return;
    }

    this.applyState(() => { this.busyId = null; });
    await this.load(false);
  }

  async remove(service: Service): Promise<void> {
    const confirmed = confirm(
      `Supprimer définitivement « ${service.name} » ?\n\n` +
      'Si des réservations y sont rattachées, désactivez-la plutôt.'
    );
    if (!confirmed) return;

    this.applyState(() => {
      this.busyId = service.id;
      this.error = '';
    });

    const result = await this.adminService.deleteService(service.id);

    if (!result.success) {
      this.applyState(() => {
        this.busyId = null;
        this.error = result.error || 'La suppression a échoué.';
      });
      return;
    }

    this.applyState(() => { this.busyId = null; });

    // Sans ça, le fichier resterait orphelin dans le stockage — mais rien
    // n'oblige à attendre ce nettoyage pour rendre la main.
    void this.adminService.deleteServiceImage(service.image_url);
    await this.load(false);
  }

  formatDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m}`;
  }
}
