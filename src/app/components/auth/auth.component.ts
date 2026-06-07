import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { PhoneInputComponent } from '../shared/phone-input/phone-input.component';
import { PasswordResetModalComponent } from '../shared/password-reset-modal/password-reset-modal.component';
import { IconComponent } from '../shared/icon/icon.component';
import { isValidPhone, normalizePhone, PHONE_ERROR_MESSAGE } from '../../validators/phone.validator';

type AuthTab = 'login' | 'register';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, PhoneInputComponent, PasswordResetModalComponent, IconComponent],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss']
})
export class AuthComponent implements OnInit {
  activeTab: AuthTab = 'login';

  loginEmail = '';
  loginEmailError = '';
  loginPassword = '';
  showLoginPassword = false;
  showResetModal = false;

  regName = '';
  regPhone = '';
  regEmail = '';
  regPassword = '';
  regPhoneError = '';
  regEmailError = '';
  showRegPassword = false;

  loading = false;
  checkingRegPhone = false;
  checkingRegEmail = false;
  error = '';
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'register' || tab === 'login') {
      this.activeTab = tab;
    }
  }

  get pwdChecks() {
    return {
      length:    this.regPassword.length >= 8,
      uppercase: /[A-Z]/.test(this.regPassword),
      special:   /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(this.regPassword)
    };
  }

  get isPasswordValid(): boolean {
    const c = this.pwdChecks;
    return c.length && c.uppercase && c.special;
  }

  setTab(tab: AuthTab): void {
    this.activeTab = tab;
    this.error = '';
    this.successMessage = '';
    this.loginEmailError = '';
    this.regPhoneError = '';
    this.regEmailError = '';
  }

  onLoginEmailBlur(): void {
    const email = this.loginEmail.trim();
    if (!email) return;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    this.loginEmailError = valid ? '' : 'Adresse email invalide.';
  }

  async onRegPhoneBlur(): Promise<void> {
    const phone = this.regPhone.trim();
    if (!phone) return;
    this.regPhoneError = isValidPhone(phone) ? '' : PHONE_ERROR_MESSAGE;
    if (this.regPhoneError) return;

    this.checkingRegPhone = true;
    this.cdr.detectChanges();
    const exists = await this.authService.checkUserExistsByPhone(phone);
    this.checkingRegPhone = false;
    if (exists) this.regPhoneError = 'Ce numéro est déjà associé à un compte DS Nails.';
    this.cdr.detectChanges();
  }

  async onRegEmailBlur(): Promise<void> {
    const email = this.regEmail.trim();
    if (!email) { this.regEmailError = ''; return; }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    this.regEmailError = valid ? '' : 'Adresse email invalide.';
    if (this.regEmailError) return;

    this.checkingRegEmail = true;
    this.cdr.detectChanges();
    const exists = await this.authService.checkUserExistsByEmail(email);
    this.checkingRegEmail = false;
    if (exists) this.regEmailError = 'Un compte existe déjà avec cet email.';
    this.cdr.detectChanges();
  }

  async login(): Promise<void> {
    this.onLoginEmailBlur();
    if (this.loginEmailError) return;

    this.loading = true;
    this.error = '';

    const result = await this.authService.signIn(this.loginEmail.trim(), this.loginPassword);

    this.loading = false;
    if (result.success) {
      this.router.navigate(['/mon-espace']);
    } else {
      this.error = result.error || 'Une erreur est survenue.';
    }
    this.cdr.detectChanges();
  }

  async register(): Promise<void> {
    if (!isValidPhone(this.regPhone.trim())) {
      this.regPhoneError = PHONE_ERROR_MESSAGE;
      return;
    }
    this.onRegEmailBlur();
    if (this.regEmailError) return;

    this.loading = true;
    this.error = '';
    this.successMessage = '';

    const result = await this.authService.signUp(
      this.regName,
      normalizePhone(this.regPhone.trim()),
      this.regEmail.trim(),
      this.regPassword
    );

    this.loading = false;
    if (result.success) {
      this.regName = '';
      this.regPhone = '';
      this.regEmail = '';
      this.regPassword = '';
      this.showRegPassword = false;
      this.successMessage = 'Compte créé avec succès ! Vous pouvez maintenant vous connecter.';
      this.setTab('login');
    } else {
      this.error = result.error || 'Une erreur est survenue.';
    }
    this.cdr.detectChanges();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
