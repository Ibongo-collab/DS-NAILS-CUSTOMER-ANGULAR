import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  ViewEncapsulation,
  inject
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss'],
  /**
   * Cette feuille porte les styles communs à tous les écrans d'administration.
   * Encapsulée, elle ne s'appliquerait qu'au gabarit lui-même et chaque écran
   * devrait en refaire une copie — c'est ce qui gonflait leurs CSS jusqu'à
   * dépasser le budget.
   *
   * Sans encapsulation, elle est posée une fois pour toutes, à l'arrivée dans
   * l'espace d'administration : les visiteurs ne la téléchargent jamais,
   * puisqu'elle voyage dans le chunk admin. Tout y est porté par
   * `.admin-shell`, l'enveloppe rendue ci-dessous, ce qui l'empêche d'atteindre
   * les écrans clients.
   */
  encapsulation: ViewEncapsulation.None
})
export class AdminLayoutComponent implements AfterViewInit {
  @ViewChild('tabs') tabsRef?: ElementRef<HTMLElement>;

  private destroyRef = inject(DestroyRef);

  constructor(private authService: AuthService, private router: Router) {}

  get adminName(): string {
    return this.authService.profile?.full_name || this.authService.getUserEmail();
  }

  ngAfterViewInit(): void {
    this.revealActiveTab();

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.revealActiveTab());
  }

  /**
   * Ramène l'onglet courant dans la partie visible du rail.
   *
   * Les onglets défilent sur une seule ligne : arriver directement sur
   * « Notifications », le dernier, laisserait le rail au début et l'onglet
   * actif hors de l'écran — l'utilisateur ne verrait pas où il se trouve.
   */
  private revealActiveTab(): void {
    const rail = this.tabsRef?.nativeElement;
    if (!rail) return;

    // Après la navigation, `routerLinkActive` pose sa classe au cycle suivant
    requestAnimationFrame(() => {
      const actif = rail.querySelector<HTMLElement>('.admin-tab.active');
      if (!actif) return;

      // Rien à faire si tout tient déjà : un défilement inutile serait perçu
      // comme un tremblement au chargement.
      if (rail.scrollWidth <= rail.clientWidth) return;

      // `block: 'nearest'` : on ne veut décaler que l'horizontale, pas faire
      // sauter la page verticalement.
      actif.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  }
}
