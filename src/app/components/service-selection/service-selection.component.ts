import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { DurationPipe } from '../../pipes/duration.pipe';
import { Service } from '../../models/booking.model';


@Component({
  selector: 'app-service-selection',
  standalone: true,
  imports: [DurationPipe],
  templateUrl: './service-selection.component.html',
  styleUrls: ['./service-selection.component.scss']
})
export class ServiceSelectionComponent implements OnInit {
  services: Service[] = [];
  selectedService: Service | null = null;
  loading = true;
  error = '';
  readonly skeletonItems = [1, 2, 3, 4];

  constructor(
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentState = this.bookingService.getCurrentState();
    if (currentState.selectedService) {
      this.selectedService = currentState.selectedService;
    }
    this.loadServices();
  }

  loadServices(): void {
    this.bookingService.getServices().subscribe({
      next: (services) => {
        this.services = services.sort((a, b) =>
          a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
        );
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Impossible de charger les services. Veuillez réessayer.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Photo téléversée depuis l'administration. */
  getServiceImage(service: Service): string | null {
    return service.image_url || null;
  }

  selectService(service: Service): void {
    this.selectedService = service;
  }

  continue(): void {
    if (this.selectedService) {
      this.bookingService.updateBookingState({
        selectedService: this.selectedService,
        currentStep: 2
      });
      this.router.navigate(['/date']);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
