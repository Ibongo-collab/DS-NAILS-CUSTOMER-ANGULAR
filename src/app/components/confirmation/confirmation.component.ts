import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BookingService } from '../../services/booking.service';
import { BookingState } from '../../models/booking.model';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <main class="main-content">
        <div class="confirmation-card">
          <div class="confirmation-icon">✨</div>
          <h2 class="confirmation-title">Réservation confirmée !</h2>
          <p class="confirmation-subtitle">Nous avons hâte de vous accueillir</p>
        </div>

        <div class="booking-details" *ngIf="bookingState">
          <div class="detail-row">
            <div class="detail-icon">💅</div>
            <div class="detail-info">
              <div class="detail-label">Service</div>
              <div class="detail-value">{{ bookingState.selectedService?.name }}</div>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-icon">📅</div>
            <div class="detail-info">
              <div class="detail-label">Date</div>
              <div class="detail-value">{{ formatDate(bookingState.selectedDate!) }}</div>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-icon">🕐</div>
            <div class="detail-info">
              <div class="detail-label">Horaire</div>
              <div class="detail-value">
                {{ bookingState.selectedTime }} - {{ calculateEndTime() }}
              </div>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-icon">👤</div>
            <div class="detail-info">
              <div class="detail-label">Client</div>
              <div class="detail-value">{{ bookingState.clientInfo?.name }}</div>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-icon">📱</div>
            <div class="detail-info">
              <div class="detail-label">Téléphone</div>
              <div class="detail-value">{{ bookingState.clientInfo?.phone }}</div>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-icon">📍</div>
            <div class="detail-info">
              <div class="detail-label">Adresse</div>
              <div class="detail-value">123 Bd Mohammed V, Casablanca</div>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-icon">💰</div>
            <div class="detail-info">
              <div class="detail-label">Prix</div>
              <div class="detail-value">{{ bookingState.selectedService?.price }} DH</div>
            </div>
          </div>
        </div>

        <div class="notification-info" *ngIf="bookingState?.clientInfo?.whatsappNotification">
          <p>📱 Un rappel vous sera envoyé sur WhatsApp 24h avant votre rendez-vous</p>
        </div>

        <div class="btn-container">
          <button class="btn btn-primary" (click)="newBooking()">
            Nouvelle réservation
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

    .main-content {
      padding: 2rem 1.5rem;
    }

    .confirmation-card {
      background: linear-gradient(135deg, #C89B7B 0%, #967259 100%);
      color: white;
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      margin-bottom: 2rem;
      box-shadow: 0 10px 30px rgba(150, 114, 89, 0.3);
    }

    .confirmation-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      animation: bounceIn 0.6s ease;
    }

    @keyframes bounceIn {
      0% { transform: scale(0); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    .confirmation-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 2rem;
      margin-bottom: 0.5rem;
      font-weight: 400;
    }

    .confirmation-subtitle {
      opacity: 0.95;
      font-size: 0.95rem;
    }

    .booking-details {
      background: #FFF8F0;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .detail-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.875rem 0;
      border-bottom: 1px solid #E8DDD0;
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-icon {
      font-size: 1.5rem;
      min-width: 30px;
      text-align: center;
    }

    .detail-info {
      flex: 1;
    }

    .detail-label {
      font-size: 0.8rem;
      color: #967259;
      font-weight: 500;
      margin-bottom: 0.25rem;
    }

    .detail-value {
      font-weight: 500;
      color: #2A2A2A;
    }

    .notification-info {
      background: #e8f5e9;
      color: #2e7d32;
      padding: 1.5rem;
      border-radius: 12px;
      text-align: center;
      font-size: 0.9rem;
      margin-bottom: 1.5rem;
    }

    .btn-container {
      display: flex;
      gap: 1rem;
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

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(150, 114, 89, 0.3);
    }
  `]
})
export class ConfirmationComponent implements OnInit {
  bookingState: BookingState | null = null;

  constructor(
    private bookingService: BookingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.bookingState = this.bookingService.getCurrentState();

    // Vérifier que la réservation est complète
    if (!this.bookingState.selectedService || 
        !this.bookingState.selectedDate || 
        !this.bookingState.selectedTime ||
        !this.bookingState.clientInfo) {
      this.router.navigate(['/']);
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
                        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    
    return `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  calculateEndTime(): string {
    if (!this.bookingState?.selectedTime || !this.bookingState?.selectedService) {
      return '';
    }

    const [hours, minutes] = this.bookingState.selectedTime.split(':').map(Number);
    const durationMinutes = this.bookingState.selectedService.duration_minutes;
    const endMinutes = minutes + durationMinutes;
    const endHours = hours + Math.floor(endMinutes / 60);
    const finalMinutes = endMinutes % 60;
    
    return `${endHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
  }

  newBooking(): void {
    this.bookingService.resetBookingState();
    this.router.navigate(['/']);
  }
}
