import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../shared/icon/icon.component';

/** Survivent à un rechargement de page : la session est fermée à ce stade. */
const PENDING_EMAIL_KEY = 'ds-nails.pending-email';
const PREVIOUS_EMAIL_KEY = 'ds-nails.previous-email';

/** Instant d'envoi du code, conservé pour que le décompte survive à un rechargement. */
const CODE_SENT_AT_KEY = 'ds-nails.code-sent-at';

/** Supabase limite la fréquence des renvois ; on s'aligne pour éviter un refus. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Durée de validité du code, à tenir alignée avec le réglage Supabase
 * « Email OTP expiration » (Authentication > Providers > Email), en secondes.
 * Ce décompte est purement informatif : c'est le serveur qui fait foi.
 */
const CODE_VALIDITY_SECONDS = 600;

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './confirm-email.component.html',
  styleUrls: ['./confirm-email.component.scss']
})
export class ConfirmEmailComponent implements OnInit, OnDestroy {
  @ViewChildren('codeBox') codeBoxes!: QueryList<ElementRef<HTMLInputElement>>;

  pendingEmail = '';
  previousEmail = '';
  /** Une case par chiffre */
  digits: string[] = [];
  loading = false;
  error = '';
  confirmed = false;

  resending = false;
  resendNotice = '';
  resendCooldown = 0;

  /** Secondes restantes avant expiration du code, null tant qu'aucun envoi n'est connu */
  codeExpiresIn: number | null = null;

  private ticker: ReturnType<typeof setInterval> | null = null;
  private sentAt = 0;

  /**
   * Doit correspondre au réglage « Email OTP Length » du projet Supabase
   * (Authentication > Providers > Email), fixé à 6.
   */
  readonly codeLength = 6;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  /**
   * Les appels de `@supabase/auth-js` passent par l'API Web Locks, que zone.js
   * ne patche pas : la reprise après `await` peut se produire hors de la zone
   * Angular, et l'écran ne se rafraîchirait qu'à la prochaine interaction.
   */
  private applyState(mutate: () => void): void {
    this.zone.run(() => {
      mutate();
      this.cdr.detectChanges();
    });
  }

  ngOnInit(): void {
    this.digits = Array(this.codeLength).fill('');

    // L'adresse arrive par l'état de navigation, puis est conservée pour
    // survivre à un rafraîchissement de la page
    const fromState = this.router.getCurrentNavigation()?.extras?.state?.['email']
      ?? history.state?.['email'];

    const previousFromState = this.router.getCurrentNavigation()?.extras?.state?.['previousEmail']
      ?? history.state?.['previousEmail'];

    if (fromState) {
      this.pendingEmail = fromState;
      sessionStorage.setItem(PENDING_EMAIL_KEY, fromState);
    } else {
      this.pendingEmail = sessionStorage.getItem(PENDING_EMAIL_KEY) || '';
    }

    if (previousFromState) {
      this.previousEmail = previousFromState;
      sessionStorage.setItem(PREVIOUS_EMAIL_KEY, previousFromState);
    } else {
      this.previousEmail = sessionStorage.getItem(PREVIOUS_EMAIL_KEY) || '';
    }

    if (!this.pendingEmail) {
      this.error = 'Aucune demande de changement en cours. Reconnectez-vous pour en lancer une.';
      return;
    }

    // Navigation fraîche = code tout juste envoyé ; rechargement = on reprend
    // l'instant mémorisé, sinon le décompte repartirait à zéro à chaque F5
    const stored = Number(sessionStorage.getItem(CODE_SENT_AT_KEY));
    this.sentAt = fromState || !stored ? Date.now() : stored;
    sessionStorage.setItem(CODE_SENT_AT_KEY, String(this.sentAt));

    this.startTicker();
  }

  // ==================== DÉCOMPTES ====================

  private startTicker(): void {
    this.stopTicker();
    this.tick();
    this.ticker = setInterval(() => {
      this.tick();
      this.cdr.detectChanges();
    }, 1000);
  }

  private tick(): void {
    const elapsed = Math.floor((Date.now() - this.sentAt) / 1000);
    this.codeExpiresIn = Math.max(CODE_VALIDITY_SECONDS - elapsed, 0);
    if (this.resendCooldown > 0) this.resendCooldown -= 1;
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  get codeExpired(): boolean {
    return this.codeExpiresIn === 0;
  }

  /** « 9:07 » */
  get expiryLabel(): string {
    const total = this.codeExpiresIn ?? 0;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // ==================== SAISIE DU CODE ====================

  get code(): string {
    return this.digits.join('');
  }

  private focusAt(index: number): void {
    const target = Math.min(Math.max(index, 0), this.codeLength - 1);
    const box = this.codeBoxes?.get(target);
    box?.nativeElement.focus();
    box?.nativeElement.select();
  }

  /** Recopie l'état du modèle dans le DOM après une modification programmée. */
  private syncBoxes(): void {
    this.codeBoxes?.forEach((box, i) => {
      box.nativeElement.value = this.digits[i] ?? '';
    });
  }

  /** Répartit plusieurs chiffres à partir d'une case donnée (collage, autofill). */
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

    // Le champ reçoit d'un coup tout le code (collage clavier, autofill iOS)
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
      // Case déjà vide : on efface la précédente et on y remonte
      if (!this.digits[index]) {
        event.preventDefault();
        this.digits[Math.max(index - 1, 0)] = '';
        this.syncBoxes();
        this.focusAt(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.focusAt(index - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.focusAt(index + 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.submit();
    }
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

  get canSubmit(): boolean {
    return (
      this.code.length === this.codeLength &&
      !!this.pendingEmail &&
      !this.loading &&
      !this.codeExpired
    );
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) return;

    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.authService.verifyEmailChange(this.pendingEmail, this.code);

    if (!result.success) {
      this.applyState(() => {
        this.loading = false;
        this.error = result.error || 'La validation a échoué.';
        this.resetCode();
      });
      return;
    }

    sessionStorage.removeItem(PENDING_EMAIL_KEY);
    sessionStorage.removeItem(PREVIOUS_EMAIL_KEY);
    sessionStorage.removeItem(CODE_SENT_AT_KEY);
    this.stopTicker();

    this.applyState(() => {
      this.loading = false;
      this.confirmed = true;
    });
  }

  // ==================== RENVOI DU CODE ====================

  get canResend(): boolean {
    return !!this.pendingEmail && !this.resending && this.resendCooldown === 0;
  }

  async resend(): Promise<void> {
    if (!this.canResend) return;

    this.resending = true;
    this.resendNotice = '';
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.authService.resendEmailChangeCode(
      this.previousEmail,
      this.pendingEmail
    );

    if (!result.success) {
      this.applyState(() => {
        this.resending = false;
        this.error = result.error || 'Le renvoi a échoué.';
      });
      return;
    }

    // Nouveau code = nouvelle fenêtre de validité
    this.sentAt = Date.now();
    sessionStorage.setItem(CODE_SENT_AT_KEY, String(this.sentAt));

    this.applyState(() => {
      this.resending = false;
      this.resendCooldown = RESEND_COOLDOWN_SECONDS;
      this.startTicker();
      this.resetCode();
      this.resendNotice = `Un nouveau code a été envoyé à ${this.pendingEmail}.`;
    });
  }

  ngOnDestroy(): void {
    this.stopTicker();
  }

  goToLogin(): void {
    this.router.navigate(['/auth'], { queryParams: { tab: 'login' } });
  }
}
