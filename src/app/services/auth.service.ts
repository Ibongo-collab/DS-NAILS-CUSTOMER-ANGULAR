import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { normalizePhone } from '../validators/phone.validator';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null | undefined>(undefined);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private supabase: SupabaseService, private ngZone: NgZone) {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.ngZone.run(() => {
        this.currentUserSubject.next(data.session?.user ?? null);
      });
    });

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.ngZone.run(() => {
        this.currentUserSubject.next(session?.user ?? null);
      });
    });
  }

  get currentUser(): User | null | undefined {
    return this.currentUserSubject.value;
  }

  get isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  get isInitialized(): boolean {
    return this.currentUserSubject.value !== undefined;
  }

  getUserName(): string {
    return this.currentUser?.user_metadata?.['full_name'] || '';
  }

  getUserPhone(): string {
    return this.currentUser?.user_metadata?.['phone'] || '';
  }

  getUserEmail(): string {
    return this.currentUser?.email || '';
  }

  async signUp(
    fullName: string,
    phone: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone
        }
      }
    });

    if (error) return { success: false, error: this.translateError(error.message) };
    return { success: true };
  }

  async signIn(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: this.translateError(error.message) };
    return { success: true };
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }

  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) return { success: false, error: this.translateError(error.message) };
    return { success: true };
  }

  async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: this.translateError(error.message) };
    return { success: true };
  }

  // S'abonne à l'événement de récupération de mot de passe (lien email cliqué)
  onPasswordRecovery(callback: () => void): void {
    this.supabase.client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.ngZone.run(() => callback());
      }
    });
  }

  async checkUserExistsByEmail(email: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('check_auth_user_exists', { p_email: email });
    if (error) return false;
    return !!data;
  }

  async checkUserExistsByPhone(phone: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('check_auth_user_exists', { p_phone: normalizePhone(phone) });
    if (error) return false;
    return !!data;
  }

  async checkUserExistsByEmailAndPhone(email: string, phone: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('check_auth_user_exists', {
      p_email: email,
      p_phone: normalizePhone(phone)
    });
    if (error) return false;
    return !!data;
  }

  private translateError(message: string): string {
    if (message.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.';
    if (message.includes('Email not confirmed')) return 'Compte non confirmé. Vérifiez votre boîte mail.';
    if (message.includes('User already registered')) return 'Un compte existe déjà avec cet email.';
    if (message.includes('New password should be different')) return 'Le nouveau mot de passe doit être différent de l\'ancien.';
    if (message.includes('Password should be')) return 'Le mot de passe doit contenir au moins 8 caractères.';
    return message;
  }
}
