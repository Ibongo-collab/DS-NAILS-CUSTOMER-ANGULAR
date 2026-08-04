import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="navbar">
      <div class="navbar-inner">
        <a class="brand" routerLink="/" aria-label="Accueil DS Nails">
          <img class="brand-logo" src="img/ds-nails.jpeg" alt="DS Nails">
        </a>

        <nav class="nav-links">
          @if (isAuthenticated) {
            @if (isAdmin) {
              <a
                class="nav-link nav-link-admin"
                routerLink="/admin"
                routerLinkActive="active">Admin</a>
            }
            <a
              class="nav-link"
              routerLink="/mon-espace"
              [class.active]="isClientSpaceActive">Mon espace</a>
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

    .nav-link:hover,
    .nav-link.active {
      color: var(--link-hover);
    }

    /* Le soulignement du survol sert aussi de marqueur de page courante */
    .nav-link:hover::after,
    .nav-link.active::after {
      width: 100%;
    }

    .nav-link-admin {
      color: #69005A;
      padding: 0.35rem 0.75rem;
      border: 1px solid rgba(105, 0, 90, 0.25);
      border-radius: 999px;
    }

    /* La pastille Admin porte l'état actif par son fond, pas par un soulignement */
    .nav-link-admin::after { display: none; }

    .nav-link-admin:hover,
    .nav-link-admin.active {
      background: #FCF4FB;
      border-color: #69005A;
    }

    .nav-link-admin.active {
      background: #F8CFF6;
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
  isAdmin = false;

  /**
   * « Mon espace » reste actif sur /parametres : les paramètres sont désormais
   * une sous-page de l'espace client, pas une destination indépendante.
   */
  get isClientSpaceActive(): boolean {
    const path = this.router.url.split(/[?#]/)[0];
    return path.startsWith('/mon-espace') || path.startsWith('/parametres');
  }

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

    this.authService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin === true;
      this.cdr.detectChanges();
    });

    // Session arrivée au bout de ses 24 h : on sort l'utilisateur de l'écran
    // où il se trouve, sinon il resterait devant une interface qui le croit connecté
    this.authService.sessionExpired$.subscribe(() => {
      this.router.navigate(['/auth'], {
        queryParams: { tab: 'login', reason: 'session-timeout' }
      });
      this.cdr.detectChanges();
    });
  }
}
