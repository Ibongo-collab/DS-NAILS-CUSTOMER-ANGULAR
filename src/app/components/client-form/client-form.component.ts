import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../services/booking.service';
import { BookingRequest } from '../../models/booking.model';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <div class="progress-bar">
        <div class="progress-fill" [style.width]="'75%'"></div>
      </div>
      <div class="progress-label">Étape 4/4 - Vos informations</div>

      <main class="main-content">
        <h2 class="step-title">Vos informations</h2>

        <form (ngSubmit)="submit()" #bookingForm="ngForm">
          <div class="form-group">
            <label class="form-label">Nom complet *</label>
            <input 
              type="text" 
              class="form-input" 
              [(ngModel)]="clientName"
              name="clientName"
              placeholder="Fatima Zahra"
              required>
          </div>

          <div class="form-group">
            <label class="form-label">Téléphone *</label>
            <input 
              type="tel" 
              class="form-input" 
              [(ngModel)]="clientPhone"
              name="clientPhone"
              placeholder="+212 6XX XXX XXX"
              required>
          </div>

          <div class="form-group">
            <label class="form-label">Email *</label>
            <input 
              type="email" 
              class="form-input" 
              [(ngModel)]="clientEmail"
              name="clientEmail"
              placeholder="votre@email.com"
              required>
          </div>

          <div class="form-group">
            <label class="checkbox-group">
              <input 
                type="checkbox" 
                [(ngModel)]="whatsappNotif"
                name="whatsappNotif">
              <span>Recevoir un rappel WhatsApp 24h avant</span>
            </label>
          </div>

          <div class="error" *ngIf="error">
            {{ error }}
          </div>

          <div class="btn-container">
            <button type="button" class="btn btn-secondary" (click)="goBack()">
              Retour
            </button>
            <button 
              type="submit" 
              class="btn btn-primary" 
              [disabled]="!bookingForm.form.valid || submitting">
              <span *ngIf="!submitting">Confirmer</span>
              <span *ngIf="submitting">
                <span class="spinner-small"></span> Réservation...
              </span>
            </button>
          </div>
        </form>
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

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #2A2A2A;
      font-size: 0.9rem;
    }

    .form-input {
      width: 100%;
      padding: 0.875rem;
      border: 2px solid #E8DDD0;
      border-radius: 8px;
      font-family: 'Montserrat', sans-serif;
      font-size: 1rem;
      transition: all 0.3s ease;
      background: #FFF8F0;
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: #967259;
      background: white;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: #FFF8F0;
      border-radius: 8px;
      cursor: pointer;
    }

    .checkbox-group input[type="checkbox"] {
      width: 20px;
      height: 20px;
      cursor: pointer;
      accent-color: #967259;
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
      opacity: 0.7;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #E8DDD0;
      color: #2A2A2A;
    }

    .btn-secondary:hover {
      background: #FFF8F0;
    }

    .spinner-small {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid white;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class ClientFormComponent implements OnInit {
  clientName = '';
  clientPhone = '';
  clientEmail = '';
  whatsappNotif = false;
  submitting = false;
  error = '';

  constructor(
    private bookingService: BookingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Vérifier que les étapes précédentes sont complètes
    const currentState = this.bookingService.getCurrentState();
    if (!currentState.selectedService || !currentState.selectedDate || !currentState.selectedTime) {
      this.router.navigate(['/service']);
      return;
    }

    // Restaurer les données si elles existent
    if (currentState.clientInfo) {
      this.clientName = currentState.clientInfo.name;
      this.clientPhone = currentState.clientInfo.phone;
      this.clientEmail = currentState.clientInfo.email;
      this.whatsappNotif = currentState.clientInfo.whatsappNotification;
    }
  }

  async submit(): Promise<void> {
    const currentState = this.bookingService.getCurrentState();

    if (!currentState.selectedService || !currentState.selectedDate || !currentState.selectedTime) {
      this.error = 'Informations de réservation manquantes';
      return;
    }

    this.submitting = true;
    this.error = '';

    const bookingRequest: BookingRequest = {
      service_id: currentState.selectedService.id,
      client_name: this.clientName,
      client_phone: this.clientPhone,
      client_email: this.clientEmail,
      booking_date: currentState.selectedDate,
      start_time: currentState.selectedTime,
      whatsapp_notification: this.whatsappNotif
    };

    try {
      const result = await this.bookingService.createBooking(bookingRequest);

      if (result.success && result.booking) {
        // Sauvegarder les infos client dans l'état
        this.bookingService.updateBookingState({
          clientInfo: {
            name: this.clientName,
            phone: this.clientPhone,
            email: this.clientEmail,
            whatsappNotification: this.whatsappNotif
          }
        });

        // Aller à la page de confirmation
        this.router.navigate(['/confirmation'], {
          state: { bookingId: result.booking.id }
        });
      } else {
        this.error = result.error || 'Une erreur est survenue lors de la réservation';
        this.submitting = false;
      }
    } catch (err: any) {
      console.error('Erreur lors de la soumission:', err);
      this.error = 'Une erreur inattendue est survenue. Veuillez réessayer.';
      this.submitting = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/time']);
  }
}
