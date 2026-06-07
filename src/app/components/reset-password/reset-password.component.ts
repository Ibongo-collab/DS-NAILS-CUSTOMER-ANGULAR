import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
  newPassword = '';
  confirmPassword = '';
  showNewPassword = false;
  showConfirmPassword = false;

  loading = false;
  error = '';
  success = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Supabase établit automatiquement la session de récupération à partir du lien.
    this.authService.onPasswordRecovery(() => this.cdr.detectChanges());
  }

  get pwdChecks() {
    return {
      length:    this.newPassword.length >= 8,
      uppercase: /[A-Z]/.test(this.newPassword),
      special:   /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(this.newPassword)
    };
  }

  get isPasswordValid(): boolean {
    const c = this.pwdChecks;
    return c.length && c.uppercase && c.special;
  }

  get passwordsMatch(): boolean {
    return !!this.confirmPassword && this.newPassword === this.confirmPassword;
  }

  async submit(): Promise<void> {
    if (!this.isPasswordValid || !this.passwordsMatch) return;

    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.authService.updatePassword(this.newPassword);

    this.loading = false;
    if (result.success) {
      this.success = true;
      // Déconnexion de la session de récupération : reconnexion propre ensuite
      await this.authService.signOut();
    } else {
      this.error = result.error
        || 'Le lien de réinitialisation est invalide ou a expiré. Veuillez refaire une demande.';
    }
    this.cdr.detectChanges();
  }

  goToLogin(): void {
    this.router.navigate(['/auth']);
  }
}
