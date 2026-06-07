import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="navbar">
      <div class="navbar-inner">
        <a class="brand" routerLink="/" aria-label="Accueil DS Nails">
          <img class="brand-logo" src="img/ds-nails.jpeg" alt="DS Nails">
        </a>

        <nav class="nav-links">
          @if (isAuthenticated) {
            <a class="nav-link" routerLink="/mon-espace">Mon espace</a>
          } @else {
            <a class="nav-link" routerLink="/auth" [queryParams]="{ tab: 'register' }">S'inscrire</a>
            <a class="nav-link" routerLink="/auth" [queryParams]="{ tab: 'login' }">Connexion</a>
          }
        </nav>
      </div>
    </header>

    <main class="app-content">
      <router-outlet></router-outlet>
    </main>

    <footer class="app-footer">
      © 2026 DS NAILS. Tous droits réservés.
    </footer>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-height: 100vh;
    }

    .navbar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border-soft);
    }

    .navbar-inner {
      max-width: 1100px;
      margin: 0 auto;
      height: 72px;
      padding: 0 1.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      line-height: 0;
    }

    .brand-logo {
      height: 50px;
      width: auto;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid var(--border-soft);
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 2.25rem;
    }

    .nav-link {
      position: relative;
      font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: var(--link);
      text-decoration: none;
      cursor: pointer;
      transition: color 0.2s;
      background: none;
      border: none;
      padding: 0;
    }

    .nav-link::after {
      content: '';
      position: absolute;
      left: 0;
      bottom: -6px;
      width: 0;
      height: 1.5px;
      background: var(--gold-grad);
      transition: width 0.25s ease;
    }

    .nav-link:hover {
      color: var(--link-hover);
    }

    .nav-link:hover::after {
      width: 100%;
    }

    .app-footer {
      text-align: center;
      padding: 1.75rem 1.5rem;
      font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 2px;
      color: var(--heading);
      background: var(--bg);
      border-top: 1px solid var(--border-soft);
    }

    @media (max-width: 560px) {
      .navbar-inner {
        height: 60px;
        padding: 0 1rem;
      }
      .brand-logo {
        height: 40px;
      }
      .nav-links {
        gap: 1.2rem;
      }
      .nav-link {
        font-size: 0.68rem;
        letter-spacing: 1.2px;
      }
    }
  `]
})
export class App implements OnInit {
  title = 'DS Nails';
  isAuthenticated = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.isAuthenticated = !!user;
      this.cdr.detectChanges();
    });
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
