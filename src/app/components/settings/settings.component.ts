import { ChangeDetectorRef, Component, DestroyRef, NgZone, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Gender } from '../../models/profile.model';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  loading = true;

  // --- Informations personnelles ---
  fullName = '';
  gender: Gender | null = null;
  savingProfile = false;
  profileError = '';
  profileSuccess = '';

  // --- Adresse email ---
  currentEmail = '';
  newEmail = '';
  confirmEmail = '';
  emailError = '';
  confirmEmailError = '';
  savingEmail = false;
  checkingEmail = false;

  // --- Mot de passe ---
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  passwordError = '';
  savingPassword = false;

  private initialName = '';
  private initialGender: Gender | null = null;

  private destroyRef = inject(DestroyRef);

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  /**
   * Applique une mise à jour d'état et rafraîchit l'affichage.
   *
   * `@supabase/auth-js` sérialise ses appels avec l'API Web Locks, que zone.js
   * ne patche pas : la reprise après `await` peut donc se produire hors de la
   * zone Angular, et l'écran ne se rafraîchit qu'à la prochaine interaction.
   * On remet explicitement le pied dans la zone.
   */
  private applyState(mutate: () => void): void {
    this.zone.run(() => {
      mutate();
      this.cdr.detectChanges();
    });
  }

  ngOnInit(): void {
    // Le profil peut ne pas être encore résolu au premier rendu
    this.authService.profile$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(profile => {
        if (profile === undefined) return;

        this.currentEmail = this.authService.getUserEmail();
        this.fullName = profile?.full_name || this.authService.getUserName();
        this.gender = profile?.gender ?? null;

        this.initialName = this.fullName;
        this.initialGender = this.gender;

        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  // ==================== INFORMATIONS ====================

  get profileDirty(): boolean {
    return this.fullName.trim() !== this.initialName.trim() || this.gender !== this.initialGender;
  }

  get canSaveProfile(): boolean {
    return this.profileDirty && this.fullName.trim().length > 1 && !this.savingProfile;
  }

  async saveProfile(): Promise<void> {
    if (!this.canSaveProfile) return;

    this.savingProfile = true;
    this.profileError = '';
    this.profileSuccess = '';
    this.cdr.detectChanges();

    const result = await this.authService.updateProfile({
      fullName: this.fullName.trim(),
      ...(this.gender ? { gender: this.gender } : {})
    });

    if (!result.success) {
      if (result.sessionExpired) {
        this.applyState(() => { this.savingProfile = false; });
        this.redirectToLogin();
        return;
      }
      this.applyState(() => {
        this.savingProfile = false;
        this.profileError = result.error || 'La modification a échoué.';
      });
      return;
    }

    this.applyState(() => {
      this.savingProfile = false;
      this.initialName = this.fullName.trim();
      this.initialGender = this.gender;
      this.profileSuccess = 'Vos informations ont été mises à jour.';
    });
  }

  resetProfile(): void {
    this.fullName = this.initialName;
    this.gender = this.initialGender;
    this.profileError = '';
    this.profileSuccess = '';
  }

  // ==================== EMAIL ====================

  async onNewEmailBlur(): Promise<void> {
    const email = this.newEmail.trim();
    if (!email) { this.emailError = ''; return; }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.emailError = 'Adresse email invalide.';
      return;
    }
    if (email.toLowerCase() === this.currentEmail.toLowerCase()) {
      this.emailError = 'Cette adresse est déjà celle de votre compte.';
      return;
    }

    this.emailError = '';
    this.checkingEmail = true;
    this.cdr.detectChanges();

    const exists = await this.authService.checkUserExistsByEmail(email);
    this.checkingEmail = false;
    if (exists) this.emailError = 'Cette adresse est déjà utilisée par un autre compte.';
    this.cdr.detectChanges();
  }

  onConfirmEmailBlur(): void {
    const confirm = this.confirmEmail.trim();
    if (!confirm) { this.confirmEmailError = ''; return; }
    this.confirmEmailError =
      confirm.toLowerCase() === this.newEmail.trim().toLowerCase()
        ? ''
        : 'Les deux adresses ne correspondent pas.';
  }

  get canChangeEmail(): boolean {
    const newEmail = this.newEmail.trim();
    return (
      newEmail.length > 0 &&
      newEmail.toLowerCase() === this.confirmEmail.trim().toLowerCase() &&
      !this.emailError &&
      !this.confirmEmailError &&
      !this.checkingEmail &&
      !this.savingEmail
    );
  }

  async changeEmail(): Promise<void> {
    await this.onNewEmailBlur();
    this.onConfirmEmailBlur();
    if (this.emailError || this.confirmEmailError || !this.canChangeEmail) return;

    this.savingEmail = true;
    this.cdr.detectChanges();

    const requested = this.newEmail.trim();
    const result = await this.authService.requestEmailChange(requested);

    if (!result.success) {
      if (result.sessionExpired) {
        this.applyState(() => { this.savingEmail = false; });
        this.redirectToLogin();
        return;
      }

      this.applyState(() => {
        this.savingEmail = false;
        this.emailError = result.error || 'La demande a échoué.';
      });
      return;
    }

    // Déconnexion immédiate : l'écran suivant rappelle l'adresse concernée,
    // aucune information n'est perdue au passage.
    const previous = this.currentEmail;
    await this.authService.signOut();

    this.zone.run(() => {
      this.router.navigate(['/confirmer-email'], {
        state: { email: requested, previousEmail: previous }
      });
    });
  }

  // ==================== MOT DE PASSE ====================

  get pwdChecks() {
    return {
      length: this.newPassword.length >= 8,
      uppercase: /[A-Z]/.test(this.newPassword),
      special: /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(this.newPassword)
    };
  }

  get isNewPasswordValid(): boolean {
    const c = this.pwdChecks;
    return c.length && c.uppercase && c.special;
  }

  get passwordsMatch(): boolean {
    return !!this.confirmPassword && this.newPassword === this.confirmPassword;
  }

  get canChangePassword(): boolean {
    return (
      !!this.currentPassword &&
      this.isNewPasswordValid &&
      this.passwordsMatch &&
      !this.savingPassword
    );
  }

  async changePassword(): Promise<void> {
    if (!this.canChangePassword) return;

    // Un mot de passe identique à l'ancien serait accepté sans rien changer
    if (this.newPassword === this.currentPassword) {
      this.passwordError = 'Le nouveau mot de passe doit être différent de l\'ancien.';
      return;
    }

    this.savingPassword = true;
    this.passwordError = '';
    this.cdr.detectChanges();

    const result = await this.authService.changePassword(this.currentPassword, this.newPassword);

    if (!result.success) {
      if (result.sessionExpired) {
        this.applyState(() => { this.savingPassword = false; });
        this.redirectToLogin();
        return;
      }
      this.applyState(() => {
        this.savingPassword = false;
        this.passwordError = result.error || 'La modification a échoué.';
      });
      return;
    }

    this.applyState(() => {
      this.savingPassword = false;
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.router.navigate(['/mot-de-passe-modifie']);
    });
  }

  /** Session révoquée côté serveur : on renvoie vers la connexion avec un motif. */
  private redirectToLogin(): void {
    this.zone.run(() => {
      this.router.navigate(['/auth'], {
        queryParams: { tab: 'login', reason: 'session-expired' }
      });
    });
  }

  goBack(): void {
    this.router.navigate(['/mon-espace']);
  }
}
