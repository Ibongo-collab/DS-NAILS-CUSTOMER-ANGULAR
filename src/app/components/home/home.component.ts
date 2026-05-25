import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="home-container">
      <header class="hero">
        <h1 class="title">DS Nails</h1>
        <p class="subtitle">SALON DE BEAUTÉ & COIFFURE</p>
        <p class="tagline">Prenez rendez-vous en quelques clics</p>
      </header>

      <section class="info-section">
        <div class="info-card">
          <span class="icon">📍</span>
          <div>
            <h3>Adresse</h3>
            <p>123 Bd Mohammed V, Dakar</p>
          </div>
        </div>

        <div class="info-card">
          <span class="icon">🕐</span>
          <div>
            <h3>Horaires</h3>
            <p>Lun-Ven: 9h-18h<br>Sam: 9h-17h</p>
          </div>
        </div>

        <div class="info-card">
          <span class="icon">⭐</span>
          <div>
            <h3>Note</h3>
            <p>4.8/5 (127 avis)</p>
          </div>
        </div>
      </section>

      <button class="cta-button" (click)="startBooking()">
        Réserver maintenant
      </button>

      <section class="services-preview">
        <h2>Nos services</h2>
        <div class="service-list">
          <div class="service-item">
            <span class="service-icon">💅</span>
            <span class="service-name">Manucure</span>
            <span class="service-price">à partir de 250 DH</span>
          </div>
          <div class="service-item">
            <span class="service-icon">🦶</span>
            <span class="service-name">Pédicure</span>
            <span class="service-price">à partir de 350 DH</span>
          </div>
          <div class="service-item">
            <span class="service-icon">✂️</span>
            <span class="service-name">Coiffure</span>
            <span class="service-price">à partir de 450 DH</span>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .home-container {
      max-width: 480px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
      min-height: 100vh;
      background: linear-gradient(135deg, #FFF8F0 0%, #F5EDE3 100%);
    }

    .hero {
      text-align: center;
      padding: 3rem 0;
      background: linear-gradient(135deg, #967259 0%, #C89B7B 100%);
      color: white;
      border-radius: 20px;
      margin-bottom: 2rem;
      box-shadow: 0 10px 30px rgba(150, 114, 89, 0.2);
    }

    .title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 3rem;
      font-weight: 300;
      letter-spacing: 3px;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      font-size: 0.9rem;
      letter-spacing: 2px;
      opacity: 0.95;
      margin-bottom: 1rem;
    }

    .tagline {
      font-size: 1.1rem;
      opacity: 0.9;
    }

    .info-section {
      display: grid;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .info-card {
      background: white;
      padding: 1.25rem;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    }

    .icon {
      font-size: 2rem;
      min-width: 50px;
      text-align: center;
    }

    .info-card h3 {
      font-size: 0.9rem;
      color: #967259;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .info-card p {
      color: #2A2A2A;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .cta-button {
      width: 100%;
      padding: 1.25rem;
      background: linear-gradient(135deg, #967259 0%, #C89B7B 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 8px 20px rgba(150, 114, 89, 0.3);
      margin-bottom: 2rem;
    }

    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(150, 114, 89, 0.4);
    }

    .services-preview {
      background: white;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    }

    .services-preview h2 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.8rem;
      color: #2A2A2A;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .service-list {
      display: grid;
      gap: 1rem;
    }

    .service-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #FFF8F0;
      border-radius: 8px;
    }

    .service-icon {
      font-size: 2rem;
    }

    .service-name {
      flex: 1;
      font-weight: 500;
      color: #2A2A2A;
    }

    .service-price {
      font-size: 0.9rem;
      color: #967259;
      font-weight: 600;
    }

    @media (max-width: 480px) {
      .title {
        font-size: 2.5rem;
      }
    }
  `]
})
export class HomeComponent {
  constructor(private router: Router) {}

  startBooking(): void {
    this.router.navigate(['/service']);
  }
}
