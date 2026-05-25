import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { Service } from '../../models/booking.model';

@Component({
  selector: 'app-service-selection',
  standalone: true,
  imports: [],
  template: `
    <div class="container">
      <div class="progress-bar">
        <div class="progress-fill" [style.width]="'0%'"></div>
      </div>
      <div class="progress-label">Étape 1/4 - Choisir un service</div>

      <main class="main-content">
        <h2 class="step-title">Que souhaitez-vous réserver ?</h2>

        <div class="service-grid">
          @for (service of services; track service.id) {
            <div
              class="service-card"
              [class.selected]="selectedService?.id === service.id"
              (click)="selectService(service)">
              <div class="service-icon">{{ service.icon }}</div>
              <div class="service-info">
                <div class="service-name">{{ service.name }}</div>
                <div class="service-details">
                  {{ service.duration_minutes }} min • {{ service.price }} FCFA
                </div>
              </div>
            </div>
          }
        </div>

        @if (loading) {
          <div class="loading">Chargement des services...</div>
        }

        @if (error) {
          <div class="error">{{ error }}</div>
        }

        <div class="btn-container">
          <button class="btn btn-secondary" (click)="goBack()">Retour</button>
          <button 
            class="btn btn-primary" 
            [disabled]="!selectedService"
            (click)="continue()">
            Continuer
          </button>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .container {
      max-width: 480px;
      margin: 0 auto;
      min-height: 100vh;
      background: white;
    }

    .progress-bar {
      height: 3px;
      background: #E8DDD0;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #967259, #C89B7B);
      transition: width 0.5s ease;
    }

    .progress-label {
      text-align: center;
      padding: 1rem;
      font-size: 0.9rem;
      color: #967259;
      font-weight: 500;
      background: #FFF8F0;
    }

    .main-content {
      padding: 2rem 1.5rem;
    }

    .step-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.8rem;
      color: #2A2A2A;
      margin-bottom: 1.5rem;
      font-weight: 400;
    }

    .service-grid {
      display: grid;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .service-card {
      background: #FFF8F0;
      border: 2px solid transparent;
      border-radius: 12px;
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .service-card:hover {
      border-color: #C89B7B;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    }

    .service-card.selected {
      background: linear-gradient(135deg, #C89B7B 0%, #967259 100%);
      color: white;
      border-color: #967259;
    }

    .service-icon {
      font-size: 2rem;
      min-width: 50px;
      text-align: center;
    }

    .service-info {
      flex: 1;
    }

    .service-name {
      font-weight: 600;
      font-size: 1.1rem;
      margin-bottom: 0.25rem;
    }

    .service-details {
      font-size: 0.85rem;
      opacity: 0.8;
    }

    .service-card.selected .service-details {
      opacity: 0.95;
    }

    .loading, .error {
      text-align: center;
      padding: 2rem;
      color: #967259;
    }

    .error {
      color: #c0392b;
    }

    .btn-container {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
    }

    .btn {
      flex: 1;
      padding: 1rem;
      border: none;
      border-radius: 8px;
      font-family: 'Montserrat', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .btn-primary {
      background: linear-gradient(135deg, #967259 0%, #C89B7B 100%);
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(150, 114, 89, 0.3);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #E8DDD0;
      color: #2A2A2A;
    }

    .btn-secondary:hover {
      background: #FFF8F0;
    }
  `]
})
export class ServiceSelectionComponent implements OnInit {
  services: Service[] = [];
  selectedService: Service | null = null;
  loading = true;
  error = '';

  constructor(
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadServices();
    
    // Restaurer la sélection précédente si elle existe
    const currentState = this.bookingService.getCurrentState();
    if (currentState.selectedService) {
      this.selectedService = currentState.selectedService;
    }
  }

  loadServices(): void {
    this.loading = true;
    this.bookingService.getServices().subscribe({
      next: (services) => {
        this.services = services;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erreur lors du chargement des services:', err);
        this.error = 'Impossible de charger les services. Veuillez réessayer.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
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
