import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../admin.service';
import { Service } from '../../models/booking.model';
import { IconComponent } from '../../components/shared/icon/icon.component';

interface ServiceDraft {
  name: string;
  duration_minutes: number | null;
  price: number | null;
  description: string;
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

  constructor(
    private adminService: AdminService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.load();
  }

  private emptyDraft(): ServiceDraft {
    return { name: '', duration_minutes: null, price: null, description: '' };
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
    const services = await this.adminService.getServices();
    this.applyState(() => {
      this.services = services;
      this.loading = false;
    });
  }

  // --- Création ---

  get canCreate(): boolean {
    return (
      this.newDraft.name.trim().length > 0 &&
      !!this.newDraft.duration_minutes &&
      this.newDraft.duration_minutes > 0 &&
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
      duration_minutes: Number(this.newDraft.duration_minutes),
      price: Number(this.newDraft.price),
      description: this.newDraft.description.trim() || null,
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
      duration_minutes: service.duration_minutes,
      price: service.price,
      description: service.description || ''
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
      !!this.editDraft.duration_minutes &&
      this.editDraft.duration_minutes > 0 &&
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
      duration_minutes: Number(this.editDraft.duration_minutes),
      price: Number(this.editDraft.price),
      description: this.editDraft.description.trim() || null,
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
