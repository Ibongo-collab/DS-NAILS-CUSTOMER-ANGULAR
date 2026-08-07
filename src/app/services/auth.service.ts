import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { normalizePhone } from '../validators/phone.validator';
import { Gender, Profile } from '../models/profile.model';

const SESSION_EXPIRED_MESSAGE =
  'Votre session a expiré. Reconnectez-vous pour poursuivre.';

/** Durée de vie maximale d'une session, quelle que soit l'activité. */
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Fréquence de contrôle. Une minute suffit : l'échéance est à l'échelle du jour. */
const SESSION_CHECK_INTERVAL_MS = 60 * 1000;

/** Début de session, conservé localement — `auth.users` n'expose pas cette date. */
const SESSION_START_KEY = 'ds-nails.session-started-at';

export interface AuthOperationResult {
  success: boolean;
  error?: string;
  /** La session n'existe plus côté serveur : l'appelant doit renvoyer vers la connexion */
  sessionExpired?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null | undefined>(undefined);
  public currentUser$ = this.currentUserSubject.asObservable();

  // undefined = profil pas encore résolu, null = pas de profil (déconnecté)
  private profileSubject = new BehaviorSubject<Profile | null | undefined>(undefined);
  public profile$ = this.profileSubject.asObservable();

  /**
   * undefined tant que le profil n'est pas chargé — le guard doit attendre.
   *
   * Un super administrateur est aussi administrateur : c'est le même socle de
   * droits, augmenté. Le distinguer ici obligerait chaque écran à tester les
   * deux rôles.
   */
  public isAdmin$ = this.profile$.pipe(
    map(profile => (profile === undefined
      ? undefined
      : profile?.role === 'admin' || profile?.role === 'super_admin'))
  );

  /** Vrai pour le seul rôle habilité à supprimer une réservation. */
  public isSuperAdmin$ = this.profile$.pipe(
    map(profile => (profile === undefined ? undefined : profile?.role === 'super_admin'))
  );

  private profileLoadingFor: string | null = null;

  /** Émis quand la session dépasse sa durée de vie maximale. */
  private sessionExpiredSubject = new Subject<void>();
  public sessionExpired$ = this.sessionExpiredSubject.asObservable();

  constructor(private supabase: SupabaseService, private ngZone: NgZone) {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.ngZone.run(() => this.setUser(data.session?.user ?? null));
    });

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.ngZone.run(() => this.setUser(session?.user ?? null));
    });

    this.watchSessionAge();
  }

  // ==================== DURÉE DE VIE DE LA SESSION ====================

  /**
   * Ferme la session au-delà de 24 h, indépendamment de l'activité.
   *
   * Supabase renouvelle le jeton d'accès en continu : sans ce contrôle, une
   * session ouverte le resterait indéfiniment. La date de début est mémorisée
   * localement, `auth.users` ne l'exposant pas.
   *
   * C'est un garde-fou d'interface : la mesure de fond est le « time-box user
   * sessions » du tableau de bord Supabase, seul opposable côté serveur.
   */
  private watchSessionAge(): void {
    // Hors zone Angular : un minuteur qui tourne toute la journée y
    // déclencherait une détection de changement à chaque tour, pour ne rien
    // faire dans l'immense majorité des cas. `enforceSessionMaxAge` rentre
    // explicitement dans la zone le jour où il a quelque chose à annoncer.
    this.ngZone.runOutsideAngular(() => {
      setInterval(() => this.enforceSessionMaxAge(), SESSION_CHECK_INTERVAL_MS);

      // Un onglet en arrière-plan voit ses minuteurs ralentis par le navigateur :
      // on recontrôle au retour, sinon l'expiration passerait inaperçue.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.enforceSessionMaxAge();
      });
    });
  }

  private markSessionStart(userId: string): void {
    const stored = this.readSessionStart();
    // Une session déjà en cours garde son échéance : la rafraîchir à chaque
    // rechargement de page la rendrait perpétuelle.
    if (stored && stored.userId === userId) return;

    localStorage.setItem(
      SESSION_START_KEY,
      JSON.stringify({ userId, startedAt: Date.now() })
    );
  }

  private readSessionStart(): { userId: string; startedAt: number } | null {
    try {
      const raw = localStorage.getItem(SESSION_START_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.startedAt === 'number' ? parsed : null;
    } catch {
      return null;
    }
  }

  private async enforceSessionMaxAge(): Promise<void> {
    if (!this.currentUserSubject.value) return;

    const started = this.readSessionStart();
    if (!started) return;

    if (Date.now() - started.startedAt < SESSION_MAX_AGE_MS) return;

    await this.signOut();
    this.ngZone.run(() => this.sessionExpiredSubject.next());
  }

  private setUser(user: User | null): void {
    const previousId = this.currentUserSubject.value?.id;
    this.currentUserSubject.next(user);

    if (!user) {
      this.profileLoadingFor = null;
      localStorage.removeItem(SESSION_START_KEY);
      this.profileSubject.next(null);
      return;
    }

    this.markSessionStart(user.id);
    // Une session restaurée depuis le stockage peut déjà être périmée
    this.enforceSessionMaxAge();

    // Évite un rechargement inutile sur les simples rafraîchissements de token,
    // et un double appel quand getSession() et onAuthStateChange() se croisent
    const alreadyResolved = user.id === previousId && this.profileSubject.value !== undefined;
    if (alreadyResolved || this.profileLoadingFor === user.id) return;

    this.profileLoadingFor = user.id;
    this.loadProfile(user.id);
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    this.ngZone.run(() => {
      this.profileLoadingFor = null;
      if (error) {
        console.error('Erreur lors de la récupération du profil:', error);
        // On ne bloque pas la session : l'utilisateur reste connecté, sans rôle admin
        this.profileSubject.next(null);
        return;
      }
      this.profileSubject.next((data as Profile) ?? null);
    });
  }

  get currentUser(): User | null | undefined {
    return this.currentUserSubject.value;
  }

  get profile(): Profile | null | undefined {
    return this.profileSubject.value;
  }

  get isAdmin(): boolean {
    const role = this.profileSubject.value?.role;
    return role === 'admin' || role === 'super_admin';
  }

  get isSuperAdmin(): boolean {
    return this.profileSubject.value?.role === 'super_admin';
  }

  get isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
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
    password: string,
    gender: Gender
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          gender
        }
      }
    });

    if (error) return { success: false, error: this.translateError(error.message) };
    return { success: true };
  }

  // ==================== PARAMÈTRES DU COMPTE ====================

  /**
   * Met à jour les informations personnelles.
   *
   * On n'écrit que dans les métadonnées du compte : le trigger
   * `on_auth_user_updated` répercute dans `profiles`. Une seule écriture, donc
   * pas de risque de désynchronisation entre les deux tables.
   */
  async updateProfile(changes: {
    fullName?: string;
    phone?: string;
    gender?: Gender;
  }): Promise<AuthOperationResult> {
    const data: Record<string, string> = {};
    if (changes.fullName !== undefined) data['full_name'] = changes.fullName;
    if (changes.phone !== undefined) data['phone'] = changes.phone;
    if (changes.gender !== undefined) data['gender'] = changes.gender;

    if (!Object.keys(data).length) return { success: true };

    const { error } = await this.supabase.client.auth.updateUser({ data });
    if (error) {
      if (this.isMissingSessionError(error.message)) {
        await this.purgeStaleSession();
        return { success: false, error: SESSION_EXPIRED_MESSAGE, sessionExpired: true };
      }
      return { success: false, error: this.translateError(error.message) };
    }

    await this.reloadProfile();
    return { success: true };
  }

  /**
   * Demande un changement d'adresse email.
   *
   * L'adresse n'est PAS modifiée immédiatement : Supabase envoie un lien de
   * confirmation et ne bascule qu'après clic. Tant que ce n'est pas fait,
   * l'ancienne adresse reste celle de connexion.
   */
  async requestEmailChange(newEmail: string): Promise<AuthOperationResult> {
    const { error } = await this.supabase.client.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/parametres` }
    );

    if (error) {
      if (this.isMissingSessionError(error.message)) {
        await this.purgeStaleSession();
        return { success: false, error: SESSION_EXPIRED_MESSAGE, sessionExpired: true };
      }
      return { success: false, error: this.translateError(error.message) };
    }
    return { success: true };
  }

  /**
   * Change le mot de passe après vérification de l'ancien.
   *
   * Supabase n'exige pas l'ancien mot de passe pour `updateUser({ password })` :
   * on le vérifie donc explicitement en rejouant une connexion. Sans ce
   * contrôle, quiconque trouve une session ouverte pourrait changer le mot de
   * passe sans connaître l'actuel.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<AuthOperationResult> {
    const email = this.getUserEmail();
    if (!email) {
      await this.purgeStaleSession();
      return { success: false, error: SESSION_EXPIRED_MESSAGE, sessionExpired: true };
    }

    // Vérification de l'ancien mot de passe. Un échec ici ne touche pas à la
    // session en cours : l'utilisateur reste connecté et peut corriger sa saisie.
    const { error: signInError } = await this.supabase.client.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (signInError) {
      // On teste le code d'erreur en plus du libellé : ce dernier est en
      // anglais et peut changer d'une version de GoTrue à l'autre, ce qui
      // ferait remonter un message brut à l'utilisateur.
      const code = (signInError as { code?: string }).code;
      if (code === 'invalid_credentials' || signInError.message.includes('Invalid login credentials')) {
        return { success: false, error: 'Mot de passe actuel incorrect.' };
      }
      return { success: false, error: this.translateError(signInError.message) };
    }

    const { error } = await this.supabase.client.auth.updateUser({ password: newPassword });

    if (error) {
      if (this.isMissingSessionError(error.message)) {
        await this.purgeStaleSession();
        return { success: false, error: SESSION_EXPIRED_MESSAGE, sessionExpired: true };
      }
      return { success: false, error: this.translateError(error.message) };
    }

    // Le nouveau mot de passe n'a de sens qu'à la prochaine connexion
    await this.signOut();
    return { success: true };
  }

  /**
   * Valide le code reçu à la nouvelle adresse et bascule l'email du compte.
   *
   * `verifyOtp` ouvre une session au passage : on la referme aussitôt pour que
   * l'utilisateur se reconnecte proprement avec sa nouvelle adresse.
   */
  async verifyEmailChange(
    newEmail: string,
    token: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.verifyOtp({
      email: newEmail,
      token,
      type: 'email_change'
    });

    if (error) return { success: false, error: this.translateError(error.message) };

    await this.signOut();
    return { success: true };
  }

  /**
   * Renvoie le code de validation du changement d'adresse.
   *
   * `resend` est un endpoint public : il fonctionne alors que l'utilisateur est
   * déconnecté, contrairement à `updateUser`. GoTrue identifie le compte par
   * son adresse ; on tente donc l'adresse actuelle en premier, puis celle
   * demandée en repli — l'une des deux est la bonne clé selon la version.
   */
  async resendEmailChangeCode(
    currentEmail: string,
    newEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    const candidates = [currentEmail, newEmail].filter(Boolean);
    let lastError = '';

    for (const email of candidates) {
      const { error } = await this.supabase.client.auth.resend({
        type: 'email_change',
        email
      });

      if (!error) return { success: true };

      lastError = error.message;

      // Une limite de débit ne sera pas contournée par la seconde tentative
      if (this.isRateLimitError(error.message)) break;
    }

    return { success: false, error: this.translateError(lastError) };
  }

  private isRateLimitError(message?: string): boolean {
    if (!message) return false;
    return message.includes('rate limit') || message.includes('For security purposes');
  }

  /** Recharge le profil depuis la base (après une modification). */
  async reloadProfile(): Promise<void> {
    const userId = this.currentUserSubject.value?.id;
    if (!userId) return;
    this.profileLoadingFor = null;
    await this.loadProfile(userId);
  }

  async signIn(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: this.translateError(error.message) };
    return { success: true };
  }

  /**
   * Ferme la session sans jamais lever d'erreur.
   *
   * La session peut déjà avoir disparu côté serveur — après un changement
   * d'email, qui révoque les sessions, ou simplement si le jeton a expiré.
   * supabase-js lève alors `AuthSessionMissingError` / `session_not_found`.
   * Se déconnecter d'une session inexistante est le résultat recherché : on
   * l'absorbe, et on nettoie l'état local dans tous les cas.
   */
  async signOut(): Promise<void> {
    try {
      const { error } = await this.supabase.client.auth.signOut();
      if (error && !this.isMissingSessionError(error.message)) {
        console.error('Erreur lors de la déconnexion:', error);
      }
    } catch (error) {
      if (!this.isMissingSessionError((error as { message?: string })?.message)) {
        console.error('Erreur lors de la déconnexion:', error);
      }
      // Le serveur ne reconnaît plus la session : on purge le stockage local,
      // sinon un jeton mort resterait et l'utilisateur paraîtrait connecté.
      try {
        await this.supabase.client.auth.signOut({ scope: 'local' });
      } catch {
        /* déjà vide */
      }
    }

    this.profileLoadingFor = null;
    this.ngZone.run(() => {
      this.currentUserSubject.next(null);
      this.profileSubject.next(null);
    });
  }

  /**
   * Purge une session que le serveur ne reconnaît plus.
   *
   * Le jeton stocké localement peut rester d'apparence valide alors que sa
   * session a été révoquée côté serveur (changement d'email, déconnexion
   * globale, expiration). L'application croit alors l'utilisateur connecté
   * jusqu'au premier appel authentifié, qui échoue en `session_not_found`.
   */
  private async purgeStaleSession(): Promise<void> {
    try {
      await this.supabase.client.auth.signOut({ scope: 'local' });
    } catch {
      /* rien à purger */
    }
    this.profileLoadingFor = null;
    localStorage.removeItem(SESSION_START_KEY);
    this.ngZone.run(() => {
      this.currentUserSubject.next(null);
      this.profileSubject.next(null);
    });
  }

  private isMissingSessionError(message?: string): boolean {
    if (!message) return false;
    return (
      message.includes('Auth session missing') ||
      message.includes('session_not_found') ||
      message.includes('Session from session_id claim in JWT does not exist')
    );
  }

  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) return { success: false, error: this.translateError(error.message) };
    return { success: true };
  }

  /**
   * Indique si ce mot de passe est déjà celui du compte.
   *
   * Dans le parcours « mot de passe oublié », l'utilisateur ne connaît pas son
   * ancien mot de passe : impossible de comparer localement. Une tentative de
   * connexion tranche — elle ne réussit que si le mot de passe proposé est
   * l'actuel. La session ouverte au passage est refermée immédiatement.
   *
   * En cas de doute (compte inexistant, adresse non confirmée, erreur réseau),
   * on répond `false` : mieux vaut laisser le serveur trancher plus tard que
   * bloquer à tort une réinitialisation légitime.
   */
  async isCurrentPassword(email: string, password: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.session) return false;

    await this.signOut();
    return true;
  }

  /**
   * Termine une réinitialisation de mot de passe oublié.
   *
   * Supabase impose cet ordre : le code doit être validé AVANT de pouvoir
   * changer le mot de passe, car c'est `verifyOtp` qui ouvre la session
   * autorisant `updateUser`. Le nouveau mot de passe est donc saisi en amont
   * côté écran, mais appliqué seulement ici.
   */
  async verifyPasswordRecovery(
    email: string,
    token: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error: otpError } = await this.supabase.client.auth.verifyOtp({
      email,
      token,
      type: 'recovery'
    });

    if (otpError) return { success: false, error: this.translateError(otpError.message) };

    const { error } = await this.supabase.client.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: this.translateError(error.message) };

    // La session ouverte par le code n'a plus lieu d'être : reconnexion propre
    await this.signOut();
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

  // Ces trois vérifications sont un confort d'inscription : elles signalent un
  // doublon avant l'envoi du formulaire. La RPC est plafonnée par IP côté
  // Postgres (supabase-rate-limit.sql) ; en cas de dépassement elle renvoie une
  // erreur, on retourne alors `false` et c'est signUp() qui tranchera. Le
  // parcours reste fonctionnel, seul le retour immédiat est perdu.

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
    if (message.includes('email address has already been registered')) return 'Cette adresse email est déjà utilisée par un autre compte.';
    if (message.includes('same as the old')) return 'Cette adresse est déjà celle de votre compte.';
    if (message.includes('rate limit') || message.includes('For security purposes')) {
      return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
    }
    if (message.includes('Token has expired') || message.includes('is invalid')) {
      return 'Code incorrect ou expiré. Vérifiez les chiffres saisis, ou recommencez la demande.';
    }
    return message;
  }
}
