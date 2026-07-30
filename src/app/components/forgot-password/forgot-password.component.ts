import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  QueryList,
  ViewChildren
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../shared/icon/icon.component';

/** Durée de validité annoncée, à tenir alignée avec « Email OTP expiration ». */
const CODE_VALIDITY_SECONDS = 600;

/** Délai avant de pouvoir redemander un code. */
const RESEND_COOLDOWN_SECONDS = 120;

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent implements OnDestroy {
  @ViewChildren('codeBox') codeBoxes!: QueryList<ElementRef<HTMLInputElement>>;

  /**
   * Les deux étapes vivent dans le même composant : le nouveau mot de passe
   * reste ainsi en mémoire, sans jamais être écrit dans le stockage du
   * navigateur. Un rechargement ramène à l'étape 1, ce qui est le compromis
   * voulu — un mot de passe en clair dans sessionStorage serait pire.
   */
  step: 'form' | 'code' = 'form';

  email = '';
  newPassword = '';
  confirmPassword = '';
  showPassword = false;

  readonly codeLength = 6;
  digits: string[] = Array(6).fill('');

  loading = false;
  error = '';
  notice = '';

  codeExpiresIn = CODE_VALIDITY_SECONDS;
  resendCooldown = 0;
  resending = false;

  private ticker: ReturnType<typeof setInterval> | null = null;
  private sentAt = 0;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  /** Les appels Supabase reprennent hors de la zone Angular (API Web Locks). */
  private applyState(mutate: () => void): void {
    this.zone.run(() => {
      mutate();
      this.cdr.detectChanges();
    });
  }

  // ==================== ÉTAPE 1 : IDENTIFIANTS ====================

  get pwdChecks() {
    return {
      length: this.newPassword.length >= 8,
      uppercase: /[A-Z]/.test(this.newPassword),
      special: /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(this.newPassword)
    };
  }

  get isPasswordValid(): boolean {
    const c = this.pwdChecks;
    return c.length && c.uppercase && c.special;
  }

  get passwordsMatch(): boolean {
    return !!this.confirmPassword && this.newPassword === this.confirmPassword;
  }

  get isEmailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  get canSubmitForm(): boolean {
    return this.isEmailValid && this.isPasswordValid && this.passwordsMatch && !this.loading;
  }

  async submitForm(): Promise<void> {
    if (!this.canSubmitForm) return;

    this.applyState(() => {
      this.loading = true;
      this.error = '';
    });

    // Contrôle avant l'envoi : découvrir ce refus après la saisie du code
    // gâcherait le code, déjà consommé par la validation.
    const alreadyInUse = await this.authService.isCurrentPassword(
      this.email.trim(),
      this.newPassword
    );

    if (alreadyInUse) {
      this.applyState(() => {
        this.loading = false;
        this.error = 'Le nouveau mot de passe doit être différent de l\'ancien.';
      });
      return;
    }

    const result = await this.authService.resetPassword(this.email.trim());

    if (!result.success) {
      this.applyState(() => {
        this.loading = false;
        this.error = result.error || 'L\'envoi du code a échoué.';
      });
      return;
    }

    // On passe à l'étape suivante même si l'adresse est inconnue : révéler
    // l'inverse permettrait d'énumérer les comptes existants.
    this.applyState(() => {
      this.loading = false;
      this.step = 'code';
      this.digits = Array(this.codeLength).fill('');
      this.startWindow();
    });
  }

  // ==================== ÉTAPE 2 : CODE ====================

  get code(): string {
    return this.digits.join('');
  }

  private focusAt(index: number): void {
    const target = Math.min(Math.max(index, 0), this.codeLength - 1);
    const box = this.codeBoxes?.get(target);
    box?.nativeElement.focus();
    box?.nativeElement.select();
  }

  private syncBoxes(): void {
    this.codeBoxes?.forEach((box, i) => {
      box.nativeElement.value = this.digits[i] ?? '';
    });
  }

  private fillFrom(start: number, value: string): void {
    let cursor = start;
    for (const char of value) {
      if (cursor >= this.codeLength) break;
      this.digits[cursor] = char;
      cursor++;
    }
    this.syncBoxes();
    this.focusAt(cursor);
    this.error = '';
  }

  onDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    this.error = '';

    if (!raw) {
      this.digits[index] = '';
      input.value = '';
      return;
    }

    if (raw.length > 1) {
      this.fillFrom(index, raw);
      return;
    }

    this.digits[index] = raw;
    input.value = raw;
    this.focusAt(index + 1);
  }

  onDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      if (!this.digits[index]) {
        event.preventDefault();
        this.digits[Math.max(index - 1, 0)] = '';
        this.syncBoxes();
        this.focusAt(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.focusAt(index - 1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.focusAt(index + 1); return; }
    if (event.key === 'Enter') { event.preventDefault(); this.submitCode(); }
  }

  onDigitPaste(index: number, event: ClipboardEvent): void {
    const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    this.fillFrom(index, pasted);
  }

  private resetCode(): void {
    this.digits = Array(this.codeLength).fill('');
    this.syncBoxes();
    this.focusAt(0);
  }

  get codeExpired(): boolean {
    return this.codeExpiresIn <= 0;
  }

  get canSubmitCode(): boolean {
    return this.code.length === this.codeLength && !this.loading && !this.codeExpired;
  }

  async submitCode(): Promise<void> {
    if (!this.canSubmitCode) return;

    this.applyState(() => {
      this.loading = true;
      this.error = '';
      this.notice = '';
    });

    const result = await this.authService.verifyPasswordRecovery(
      this.email.trim(),
      this.code,
      this.newPassword
    );

    if (!result.success) {
      const message = result.error || 'La validation a échoué.';

      // Le serveur refuse le mot de passe lui-même : le code vient d'être
      // consommé, rester sur cet écran serait une impasse. On repart de la
      // saisie, là où la correction est possible.
      if (message.includes('différent de l\'ancien')) {
        this.stopTicker();
        this.applyState(() => {
          this.loading = false;
          this.step = 'form';
          this.error = message;
          this.resetCode();
        });
        return;
      }

      this.applyState(() => {
        this.loading = false;
        this.error = message;
        this.resetCode();
      });
      return;
    }

    // Navigation dans la zone Angular : hors zone, la route change sans que la
    // vue soit rafraîchie — l'écran de confirmation ne s'afficherait pas.
    this.stopTicker();
    this.zone.run(() => this.router.navigate(['/mot-de-passe-modifie']));
  }

  // ==================== RENVOI ET DÉCOMPTES ====================

  get canResend(): boolean {
    return !this.resending && this.resendCooldown <= 0;
  }

  async resend(): Promise<void> {
    if (!this.canResend) return;

    this.applyState(() => {
      this.resending = true;
      this.error = '';
      this.notice = '';
    });

    // `resend()` de Supabase ne couvre pas le type « recovery » : on relance
    // simplement une demande de réinitialisation, qui régénère un code.
    const result = await this.authService.resetPassword(this.email.trim());

    if (!result.success) {
      this.applyState(() => {
        this.resending = false;
        this.error = result.error || 'Le renvoi a échoué.';
      });
      return;
    }

    this.applyState(() => {
      this.resending = false;
      this.notice = `Un nouveau code a été envoyé à ${this.email.trim()}.`;
      this.resetCode();
      this.startWindow();
    });
  }

  /** Ouvre une fenêtre de validité et arme le délai anti-renvoi. */
  private startWindow(): void {
    this.sentAt = Date.now();
    this.codeExpiresIn = CODE_VALIDITY_SECONDS;
    this.resendCooldown = RESEND_COOLDOWN_SECONDS;
    this.startTicker();
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => {
      this.zone.run(() => {
        const elapsed = Math.floor((Date.now() - this.sentAt) / 1000);
        this.codeExpiresIn = Math.max(CODE_VALIDITY_SECONDS - elapsed, 0);
        if (this.resendCooldown > 0) this.resendCooldown -= 1;
        this.cdr.detectChanges();
      });
    }, 1000);
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  ngOnDestroy(): void {
    this.stopTicker();
  }

  // ==================== FORMATAGE ====================

  private clock(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  get expiryLabel(): string {
    return this.clock(Math.max(this.codeExpiresIn, 0));
  }

  get cooldownLabel(): string {
    return this.clock(Math.max(this.resendCooldown, 0));
  }

  backToForm(): void {
    this.stopTicker();
    this.applyState(() => {
      this.step = 'form';
      this.error = '';
      this.notice = '';
    });
  }

  goToLogin(): void {
    this.router.navigate(['/auth'], { queryParams: { tab: 'login' } });
  }
}
