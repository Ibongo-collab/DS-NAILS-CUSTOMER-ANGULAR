import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';
import { BookingRequest } from '../../models/booking.model';
import { PhoneInputComponent } from '../shared/phone-input/phone-input.component';
import { IconComponent } from '../shared/icon/icon.component';
import { isValidPhone, normalizePhone, PHONE_ERROR_MESSAGE } from '../../validators/phone.validator';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [FormsModule, PhoneInputComponent, IconComponent],
  templateUrl: './client-form.component.html',
  styleUrls: ['./client-form.component.scss']
})
export class ClientFormComponent implements OnInit {
  clientName = '';
  clientPhone = '';
  clientEmail = '';
  whatsappNotif = false;
  submitting = false;
  error = '';
  checkingPhone = false;
  phoneError = '';
  emailError = '';
  isAuthenticated = false;

  private _mustLogin = false;
  showManualLogin = false;
  loginEmail = '';
  loginPassword = '';
  showLoginPassword = false;
  loginError = '';
  loginLoading = false;

  get mustLogin(): boolean {
    return !this.isAuthenticated && this._mustLogin;
  }

  constructor(
    private bookingService: BookingService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    const currentState = this.bookingService.getCurrentState();
    if (!currentState.selectedService || !currentState.selectedDate || !currentState.selectedTime) {
      this.router.navigate(['/']);
      return;
    }

    if (currentState.clientInfo) {
      this.clientName = currentState.clientInfo.name;
      this.clientPhone = currentState.clientInfo.phone;
      this.clientEmail = currentState.clientInfo.email;
      this.whatsappNotif = currentState.clientInfo.whatsappNotification;
    }

    const user = this.authService.currentUser;
    if (user) {
      this.isAuthenticated = true;
      this.clientName = this.authService.getUserName();
      this.clientEmail = this.authService.getUserEmail();
      if (!this.clientPhone) {
        this.clientPhone = this.authService.getUserPhone();
      }
      const activeCheck = await this.bookingService.checkActiveBookingByEmail(
        this.clientEmail,
        currentState.selectedDate
      );
      if (activeCheck.hasActive) {
        this.error = activeCheck.message || '';
      }
      this.cdr.detectChanges();
    }
  }

  async onPhoneBlur(): Promise<void> {
    const phone = this.clientPhone.trim();
    if (!phone) return;

    if (!isValidPhone(phone)) {
      this.phoneError = PHONE_ERROR_MESSAGE;
      this.cdr.detectChanges();
      return;
    }

    this.checkingPhone = true;
    this.phoneError = '';
    this.cdr.detectChanges();

    const selectedDate = this.bookingService.getCurrentState().selectedDate || '';

    const bookingResult = this.isAuthenticated
      ? { hasActive: false as const, message: undefined }
      : await this.bookingService.checkActiveBookingByPhone(phone, selectedDate);

    this.checkingPhone = false;
    if (bookingResult.hasActive) {
      this.phoneError = bookingResult.message || '';
    }

    await this.checkCombinedAccount();
  }

  async onEmailBlur(): Promise<void> {
    if (this.isAuthenticated) return;

    const email = this.clientEmail.trim();
    this.emailError = '';

    if (!email) {
      this._mustLogin = false;
      this.cdr.detectChanges();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.emailError = 'Adresse email invalide.';
      this._mustLogin = false;
      this.cdr.detectChanges();
      return;
    }

    await this.checkCombinedAccount();
  }

  onFieldChange(): void {
    if (this._mustLogin) {
      this._mustLogin = false;
      this.cdr.detectChanges();
    }
  }

  openManualLogin(): void {
    this.showManualLogin = true;
    this.loginError = '';
    // Pré-remplir l'email si déjà saisi et valide
    const email = this.clientEmail.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.loginEmail = email;
    }
  }

  private async checkCombinedAccount(): Promise<void> {
    const phone = this.clientPhone.trim();
    const email = this.clientEmail.trim();

    // Les deux champs doivent être renseignés et le téléphone valide
    if (!email || !isValidPhone(phone)) {
      this._mustLogin = false;
      this.cdr.detectChanges();
      return;
    }

    const exists = await this.authService.checkUserExistsByEmailAndPhone(email, phone);
    this._mustLogin = exists;
    if (exists) {
      this.loginEmail = email;
    }
    this.cdr.detectChanges();
  }

  async inlineLogin(): Promise<void> {
    this.loginLoading = true;
    this.loginError = '';
    this.cdr.detectChanges();

    const result = await this.authService.signIn(this.loginEmail, this.loginPassword);

    this.loginLoading = false;
    if (result.success) {
      this.isAuthenticated = true;
      this._mustLogin = false;
      this.showManualLogin = false;
      this.clientName = this.authService.getUserName();
      this.clientEmail = this.authService.getUserEmail();
      if (!this.clientPhone) {
        this.clientPhone = this.authService.getUserPhone();
      }
      this.loginPassword = '';

      const selectedDate = this.bookingService.getCurrentState().selectedDate || '';
      const activeCheck = await this.bookingService.checkActiveBookingByEmail(this.clientEmail, selectedDate);
      if (activeCheck.hasActive) {
        this.error = activeCheck.message || '';
      }
    } else {
      this.loginError = result.error || 'Email ou mot de passe incorrect.';
    }
    this.cdr.detectChanges();
  }

  async submit(): Promise<void> {
    const currentState = this.bookingService.getCurrentState();

    if (!currentState.selectedService || !currentState.selectedDate || !currentState.selectedTime) {
      this.error = 'Informations de réservation manquantes';
      return;
    }

    this.submitting = true;
    this.error = '';

    const bookingRequest: BookingRequest = {
      service_id: currentState.selectedService.id,
      client_name: this.clientName,
      client_phone: normalizePhone(this.clientPhone.trim()),
      client_email: this.clientEmail.trim(),
      booking_date: currentState.selectedDate,
      start_time: currentState.selectedTime,
      whatsapp_notification: this.whatsappNotif
    };

    try {
      const result = await this.bookingService.createBooking(bookingRequest, this.isAuthenticated);

      if (result.success && result.booking) {
        this.bookingService.updateBookingState({
          clientInfo: {
            name: this.clientName,
            phone: this.clientPhone,
            email: this.clientEmail,
            whatsappNotification: this.whatsappNotif
          }
        });
        this.router.navigate(['/confirmation'], {
          state: { bookingId: result.booking.id }
        });
      } else {
        this.error = result.error || 'Une erreur est survenue lors de la réservation';
        this.submitting = false;
        this.cdr.detectChanges();
      }
    } catch (err: any) {
      console.error('Erreur lors de la soumission:', err);
      this.error = 'Une erreur inattendue est survenue. Veuillez réessayer.';
      this.submitting = false;
      this.cdr.detectChanges();
    }
  }

  goBack(): void {
    this.router.navigate(['/time']);
  }

  goToAuth(): void {
    this.router.navigate(['/auth']);
  }

  goToForgotPassword(): void {
    this.router.navigate(['/mot-de-passe-oublie']);
  }

  goToRegister(): void {
    this.router.navigate(['/auth'], { queryParams: { tab: 'register' } });
  }
}
