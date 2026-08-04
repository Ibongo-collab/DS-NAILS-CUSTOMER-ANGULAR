import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';
import { DurationPipe } from '../../pipes/duration.pipe';
import { PricedService, Promotion, Service, ServiceCategory } from '../../models/booking.model';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-service-selection',
  standalone: true,
  imports: [DurationPipe, IconComponent],
  templateUrl: './service-selection.component.html',
  styleUrls: ['./service-selection.component.scss']
})
export class ServiceSelectionComponent implements OnInit {
  category: ServiceCategory | null = null;
  services: Service[] = [];
  loading = true;
  error = '';
  readonly skeletonItems = [1, 2, 3];

  /** Un administrateur consulte les prestations, il ne les réserve pas */
  isAdmin = false;

  /** Promotions du jour. Celle qui s'appliquera dépendra de la date choisie. */
  private promotions: Promotion[] = [];

  private destroyRef = inject(DestroyRef);

  constructor(
    private bookingService: BookingService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin === true;
        this.cdr.detectChanges();
      });

    const categoryId = this.route.snapshot.paramMap.get('categoryId');

    if (!categoryId) {
      this.router.navigate(['/']);
      return;
    }

    this.loadCategory(categoryId);
    this.loadPromotions();
    this.loadServices(categoryId);
  }

  private loadPromotions(): void {
    this.bookingService.getActivePromotions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (promotions) => {
          this.promotions = promotions;
          this.cdr.detectChanges();
        }
        // Une promotion qu'on ne parvient pas à lire n'empêche pas de réserver :
        // les prix publics restent affichés.
      });
  }

  private loadCategory(categoryId: string): void {
    this.bookingService.getCategory(categoryId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (category) => {
          // Catégorie supprimée entre-temps : le lien n'a plus de sens
          if (!category) {
            this.router.navigate(['/']);
            return;
          }
          this.category = category;
          this.cdr.detectChanges();
        }
      });
  }

  private loadServices(categoryId: string): void {
    this.bookingService.getServicesByCategory(categoryId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (services) => {
          this.services = services;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.error = 'Impossible de charger les prestations. Veuillez réessayer.';
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  /** Photo téléversée depuis l'administration. */
  getServiceImage(service: Service): string | null {
    return service.image_url || null;
  }

  /** Prix affiché pour une prestation, remise du jour déduite. */
  pricing(service: Service): PricedService {
    return this.bookingService.priceOf(service, this.promotions);
  }

  priceLabel(price: number): string {
    return `${new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price || 0)} FCFA`;
  }

  /** Choisir une prestation lance le parcours de réservation. */
  selectService(service: Service): void {
    this.bookingService.updateBookingState({
      selectedService: service,
      currentStep: 2
    });
    this.router.navigate(['/date']);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
