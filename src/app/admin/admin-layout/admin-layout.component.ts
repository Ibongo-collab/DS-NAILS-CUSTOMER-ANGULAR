import { Component, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
export class AdminLayoutComponent {
  constructor(private authService: AuthService) {}

  get adminName(): string {
    return this.authService.profile?.full_name || this.authService.getUserEmail();
  }
}
