import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BookingService } from '../../services/booking.service';
import { TimeSlot } from '../../models/booking.model';

@Component({
  selector: 'app-time-selection',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <div class="progress-bar">
        <div class="progress-fill" [style.width]="'50%'"></div>
      </div>
      <div class="progress-label">Étape 3/4 - Choisir l'horaire</div>

      <main class="main-content">
        <h2 class="step-title">Choisissez votre horaire</h2>
        <p class="date-info">{{ formattedDate }}</p>

        <div class="realtime-indicator" *ngIf="realtimeConnected">
          <span class="dot"></span> Mise à jour en temps réel
        </div>

        <div class="time-grid" *ngIf="!loading && timeSlots.length > 0">
          <button 
            *ngFor="let slot of timeSlots"
            class="time-slot"
            [class.selected]="selectedTime === slot.time"
            [class.unavailable]="!slot.available"
            [class.pending]="slot.isPending"
            [disabled]="!slot.available"
            (click)="selectTime(slot.time)">
            {{ slot.time }}
            <span *ngIf="slot.isPending" class="pending-label">⏳</span>
          </button>
        </div>

        @if (loading) {
          <div class="loading">
            <div class="spinner"></div>
            Chargement des créneaux disponibles...
          </div>
        }

        <div class="no-slots" *ngIf="!loading && timeSlots.length === 0">
          Aucun créneau disponible pour cette date.<br>
          <button class="link-btn" (click)="goBack()">Choisir une autre date</button>
        </div>

        <div class="error" *ngIf="error">
          {{ error }}
        </div>

        <div class="btn-container">
          <button class="btn btn-secondary" (click)="goBack()">Retour</button>
          <button 
            class="btn btn-primary" 
            [disabled]="!selectedTime"
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
      margin-bottom: 0.5rem;
      font-weight: 400;
    }

    .date-info {
      color: #967259;
      font-weight: 500;
      margin-bottom: 1.5rem;
    }

    .realtime-indicator {
      background: #e8f5e9;
      color: #2e7d32;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }

    .dot {
      width: 8px;
      height: 8px;
      background: #4caf50;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .time-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 2rem;
    }

    .time-slot {
      background: #FFF8F0;
      border: 2px solid transparent;
      border-radius: 8px;
      padding: 1rem 0.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: 500;
      font-family: 'Montserrat', sans-serif;
      position: relative;
    }

    .time-slot:hover:not(:disabled) {
      border-color: #C89B7B;
      transform: scale(1.05);
    }

    .time-slot.selected {
      background: #967259;
      color: white;
      border-color: #967259;
    }

    .time-slot.unavailable {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .time-slot.pending {
      opacity: 0.6;
      background: #ffe0b2;
    }

    .pending-label {
      font-size: 0.7rem;
      position: absolute;
      top: 4px;
      right: 4px;
    }

    .loading {
      text-align: center;
      padding: 3rem 1rem;
      color: #967259;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #E8DDD0;
      border-top-color: #967259;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .no-slots {
      text-align: center;
      padding: 3rem 1rem;
      color: #2A2A2A;
    }

    .link-btn {
      background: none;
      border: none;
      color: #967259;
      text-decoration: underline;
      cursor: pointer;
      font-size: 1rem;
      margin-top: 1rem;
    }

    .error {
      text-align: center;
      padding: 1rem;
      color: #c0392b;
      background: #ffebee;
      border-radius: 8px;
      margin-bottom: 1rem;
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

    @media (max-width: 480px) {
      .time-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class TimeSelectionComponent implements OnInit, OnDestroy {
  timeSlots: TimeSlot[] = [];
  selectedTime: string | null = null;
  loading = true;
  error = '';
  realtimeConnected = false;
  formattedDate = '';

  private selectedDate: string = '';
  private serviceId: string = '';

  constructor(
    private bookingService: BookingService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentState = this.bookingService.getCurrentState();

    // Vérifier que les étapes précédentes sont complètes
    if (!currentState.selectedService || !currentState.selectedDate) {
      this.router.navigate(['/service']);
      return;
    }

    this.selectedDate = currentState.selectedDate;
    this.serviceId = currentState.selectedService.id;
    this.formattedDate = this.formatDate(this.selectedDate);

    // Restaurer la sélection précédente
    if (currentState.selectedTime) {
      this.selectedTime = currentState.selectedTime;
    }

    this.loadTimeSlots();
    this.setupRealtime();
  }

  ngOnDestroy(): void {
    // Se désabonner du temps réel
    this.bookingService.unsubscribeFromBookings();
  }

  async loadTimeSlots(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      this.timeSlots = await this.bookingService.getAvailableSlots(
        this.selectedDate,
        this.serviceId
      );
      this.loading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Erreur lors du chargement des créneaux:', err);
      this.error = 'Impossible de charger les créneaux. Veuillez réessayer.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  setupRealtime(): void {
    // S'abonner aux changements de réservations pour cette date
    this.bookingService.subscribeToBookings(this.selectedDate, () => {
      console.log('Nouveaux créneaux détectés, rechargement...');
      this.loadTimeSlots();
    });
    this.realtimeConnected = true;
    this.cdr.detectChanges();
  }

  selectTime(time: string): void {
    this.selectedTime = time;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
                        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    
    return `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  continue(): void {
    if (this.selectedTime) {
      this.bookingService.updateBookingState({
        selectedTime: this.selectedTime,
        currentStep: 4
      });
      this.router.navigate(['/info']);
    }
  }

  goBack(): void {
    this.router.navigate(['/date']);
  }
}
