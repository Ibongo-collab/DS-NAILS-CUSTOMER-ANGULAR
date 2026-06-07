import { Component, EventEmitter, Input, Output, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-password-reset-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './password-reset-modal.component.html',
  styleUrls: ['./password-reset-modal.component.scss']
})
export class PasswordResetModalComponent implements OnInit {
  @Input() initialEmail = '';
  @Output() closed = new EventEmitter<void>();

  email = '';
  emailError = '';
  loading = false;
  successMessage = '';
  error = '';

  constructor(private authService: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (this.initialEmail) this.email = this.initialEmail;
  }

  close(): void {
    this.closed.emit();
  }

  async submit(): Promise<void> {
    const email = this.email.trim();
    this.error = '';

    if (!email) {
      this.emailError = 'Veuillez saisir votre adresse e-mail.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.emailError = 'Adresse e-mail invalide.';
      return;
    }

    this.emailError = '';
    this.loading = true;
    this.cdr.detectChanges();

    const result = await this.authService.resetPassword(email);

    this.loading = false;
    if (result.success) {
      // Message neutre : ne révèle pas si l'adresse existe (bonne pratique sécurité)
      this.successMessage = 'Si un compte existe avec cette adresse, vous recevrez un e-mail contenant les instructions pour réinitialiser votre mot de passe.';
    } else {
      this.error = result.error || 'Une erreur est survenue. Veuillez réessayer.';
    }
    this.cdr.detectChanges();
  }
}
