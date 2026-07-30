import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../shared/icon/icon.component';

/**
 * Confirmation affichée après un changement de mot de passe réussi.
 * Route publique : la session vient d'être fermée volontairement.
 */
@Component({
  selector: 'app-password-changed',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="container">
      <main class="main-content">
        <div class="card">
          <div class="success-icon">
            <app-icon name="check-circle" [size]="48"></app-icon>
          </div>

          <h1 class="page-title">Mot de passe modifié</h1>

          <p class="lead">
            Votre mot de passe a été modifié avec succès.
            Veuillez utiliser votre nouveau mot de passe pour vous connecter.
          </p>

          <button class="btn btn-primary" (click)="goToLogin()">
            Je me reconnecte
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
    }

    .main-content { padding: 3rem 1.5rem; }

    .card {
      background: #fff;
      border: 1px solid rgba(105, 0, 90, 0.1);
      border-radius: 16px;
      padding: 2.25rem 1.75rem;
      text-align: center;
    }

    .success-icon {
      display: flex;
      justify-content: center;
      color: #1F6B3A;
      margin-bottom: 1rem;
    }

    .page-title {
      font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 1.55rem;
      font-weight: 400;
      color: #69005A;
      margin-bottom: 0.85rem;
    }

    .lead {
      font-size: 0.95rem;
      line-height: 1.65;
      color: #52514e;
      margin-bottom: 1.75rem;
    }

    .btn {
      width: 100%;
      padding: 0.95rem;
      border: none;
      border-radius: 10px;
      font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 0.92rem;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.25s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, #F3B1F1 0%, #F8CFF6 100%);
      color: #69005A;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(243, 177, 241, 0.35);
      }
    }

    @media (max-width: 560px) {
      .main-content { padding: 2rem 1rem; }
      .card { padding: 1.75rem 1.15rem; }
    }
  `]
})
export class PasswordChangedComponent {
  constructor(private router: Router) {}

  goToLogin(): void {
    this.router.navigate(['/auth'], { queryParams: { tab: 'login' } });
  }
}
