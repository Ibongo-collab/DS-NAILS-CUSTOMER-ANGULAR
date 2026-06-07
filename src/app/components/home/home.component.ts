import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { Service } from '../../models/booking.model';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  isAuthenticated = false;
  services: Service[] = [];
  loadingServices = true;
  readonly skeletonRows = [1, 2, 3, 4, 5];

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.isAuthenticated = !!user;
      this.cdr.detectChanges();
    });
    this.loadServices();
  }

  loadServices(): void {
    this.bookingService.getServices().subscribe({
      next: (services) => {
        this.services = services.sort((a, b) =>
          a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
        );
        this.loadingServices = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingServices = false;
        this.cdr.detectChanges();
      }
    });
  }

  serviceMeta(service: Service): string {
    const duration = this.formatDuration(service.duration_minutes);
    const price = this.formatPrice(service.price);
    return duration ? `${duration} - ${price} FCFA` : `${price} FCFA`;
  }

  private formatDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} minutes`;
    const hLabel = `${h} heure${h > 1 ? 's' : ''}`;
    return m === 0 ? hLabel : `${hLabel} ${m}`;
  }

  private formatPrice(price: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price || 0);
  }

  startBooking(): void {
    document.getElementById('services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  selectService(service: Service): void {
    this.bookingService.updateBookingState({
      selectedService: service,
      currentStep: 1
    });
    this.router.navigate(['/date']);
  }

  goToAuth(): void {
    this.router.navigate(['/auth']);
  }

  goToSpace(): void {
    this.router.navigate(['/mon-espace']);
  }
}
