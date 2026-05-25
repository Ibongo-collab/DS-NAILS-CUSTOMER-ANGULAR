import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BookingService } from '../../services/booking.service';

interface DateOption {
  date: string;
  label: string;
  dayName: string;
}

@Component({
  selector: 'app-date-selection',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <div class="progress-bar">
        <div class="progress-fill" [style.width]="'25%'"></div>
      </div>
      <div class="progress-label">Étape 2/4 - Choisir une date</div>

      <main class="main-content">
        <h2 class="step-title">Quand souhaitez-vous venir ?</h2>

        <div class="date-list">
          <button 
            *ngFor="let dateOption of dateOptions"
            class="date-btn"
            [class.selected]="selectedDate === dateOption.date"
            (click)="selectDate(dateOption.date)">
            <div>
              <div class="date-label">{{ dateOption.label }}</div>
              <div class="date-day">{{ dateOption.dayName }}</div>
            </div>
          </button>
        </div>

        <div class="btn-container">
          <button class="btn btn-secondary" (click)="goBack()">Retour</button>
          <button 
            class="btn btn-primary" 
            [disabled]="!selectedDate"
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

    .date-list {
      display: grid;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }

    .date-btn {
      background: #FFF8F0;
      border: 2px solid transparent;
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Montserrat', sans-serif;
      text-align: left;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .date-btn:hover {
      border-color: #C89B7B;
      transform: translateX(4px);
    }

    .date-btn.selected {
      background: #967259;
      color: white;
      border-color: #967259;
    }

    .date-label {
      font-weight: 600;
      font-size: 1.05rem;
      margin-bottom: 0.25rem;
    }

    .date-day {
      font-size: 0.85rem;
      opacity: 0.8;
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
export class DateSelectionComponent implements OnInit {
  dateOptions: DateOption[] = [];
  selectedDate: string | null = null;

  constructor(
    private bookingService: BookingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.generateDateOptions();
    
    // Restaurer la sélection précédente
    const currentState = this.bookingService.getCurrentState();
    if (currentState.selectedDate) {
      this.selectedDate = currentState.selectedDate;
    }

    // Vérifier qu'un service est sélectionné
    if (!currentState.selectedService) {
      this.router.navigate(['/service']);
    }
  }

  generateDateOptions(): void {
    const today = new Date();
    const options: DateOption[] = [];

    // Générer les 7 prochains jours
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const dateString = date.toISOString().split('T')[0];
      const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
                          'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

      let label = '';
      if (i === 0) {
        label = `Aujourd'hui ⚡`;
      } else if (i === 1) {
        label = 'Demain';
      } else {
        label = `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]}`;
      }

      options.push({
        date: dateString,
        label,
        dayName: i < 2 ? `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]}` : ''
      });
    }

    this.dateOptions = options;
  }

  selectDate(date: string): void {
    this.selectedDate = date;
  }

  continue(): void {
    if (this.selectedDate) {
      this.bookingService.updateBookingState({
        selectedDate: this.selectedDate,
        currentStep: 3
      });
      this.router.navigate(['/time']);
    }
  }

  goBack(): void {
    this.router.navigate(['/service']);
  }
}
