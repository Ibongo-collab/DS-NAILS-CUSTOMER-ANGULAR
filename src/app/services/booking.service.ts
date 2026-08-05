import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { normalizePhone } from '../validators/phone.validator';
import {
  Service,
  Booking,
  BookingRequest,
  TimeSlot,
  OpeningHours,
  BookingState,
  DateAvailability,
  ServiceCategory,
  Promotion,
  PricedService
} from '../models/booking.model';
import { priceService } from './pricing';
import { isoDayOfWeek, todayString } from '../utils/date';

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private bookingStateSubject = new BehaviorSubject<BookingState>({
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    clientInfo: null,
    currentStep: 1
  });

  public bookingState$ = this.bookingStateSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  // ==================== SERVICES ====================

  getServices(): Observable<Service[]> {
    return from(
      this.supabase.client
        .from('services')
        .select('*')
        .eq('active', true)
        .order('duration_minutes', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération des services:', response.error);
          return [];
        }
        return response.data as Service[];
      })
    );
  }

  // ==================== CATÉGORIES ====================

  /** Catégories proposées à la réservation, dans l'ordre alphabétique. */
  getCategories(): Observable<ServiceCategory[]> {
    return from(
      this.supabase.client
        .from('service_categories')
        .select('*')
        .order('name', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération des catégories:', response.error);
          return [];
        }
        return response.data as ServiceCategory[];
      })
    );
  }

  getCategory(id: string): Observable<ServiceCategory | null> {
    return from(
      this.supabase.client.from('service_categories').select('*').eq('id', id).maybeSingle()
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération de la catégorie:', response.error);
          return null;
        }
        return (response.data as ServiceCategory) ?? null;
      })
    );
  }

  getServicesByCategory(categoryId: string): Observable<Service[]> {
    return from(
      this.supabase.client
        .from('services')
        .select('*')
        .eq('active', true)
        .eq('category_id', categoryId)
        .order('duration_minutes', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération des prestations:', response.error);
          return [];
        }
        return response.data as Service[];
      })
    );
  }

  // ==================== PROMOTIONS ====================

  /**
   * Colonnes d'une promotion, prestations rattachées comprises.
   *
   * PostgREST sait imbriquer la table de liaison : une seule requête suffit,
   * pas de seconde lecture pour connaître la portée.
   */
  private static readonly PROMOTION_SELECT = '*, promotion_services(service_id)';

  /** Aplatit l'imbrication PostgREST en une simple liste d'identifiants. */
  private toPromotions(rows: unknown): Promotion[] {
    return ((rows as any[]) ?? []).map(row => ({
      ...row,
      service_ids: (row.promotion_services ?? []).map((lien: any) => lien.service_id)
    })) as Promotion[];
  }

  /** Promotions en cours à la date donnée. Lecture publique. */
  getActivePromotions(onDate?: string): Observable<Promotion[]> {
    const day = onDate || todayString();

    return from(
      this.supabase.client
        .from('promotions')
        .select(BookingService.PROMOTION_SELECT)
        .eq('active', true)
        .lte('starts_on', day)
        .gte('ends_on', day)
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération des promotions:', response.error);
          return [];
        }
        return this.toPromotions(response.data);
      })
    );
  }

  /**
   * Promotions qui touchent, même partiellement, la période demandée.
   *
   * L'écran de choix de la date propose deux semaines : plutôt qu'une requête
   * par jour survolé, on récupère une fois toutes les promotions de la fenêtre
   * et `bestPromotion` retient ensuite celle qui vaut pour le jour choisi.
   */
  getPromotionsInRange(fromDate: string, toDate: string): Observable<Promotion[]> {
    return from(
      this.supabase.client
        .from('promotions')
        .select(BookingService.PROMOTION_SELECT)
        .eq('active', true)
        .lte('starts_on', toDate)
        .gte('ends_on', fromDate)
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération des promotions:', response.error);
          return [];
        }
        return this.toPromotions(response.data);
      })
    );
  }

  /**
   * Applique la meilleure remise en vigueur à une prestation.
   *
   * Les promotions reçues sont déjà filtrées sur la bonne date par
   * `getActivePromotions`. Cet affichage reste indicatif : le prix qui fait foi
   * est celui calculé par `create_booking` et figé dans `price_at_booking`.
   */
  priceOf(service: Service, promotions: Promotion[]): PricedService {
    return priceService(service, promotions);
  }

  // ==================== HORAIRES ====================

  getOpeningHours(dayOfWeek: number): Observable<OpeningHours | null> {
    return from(
      this.supabase.client
        .from('opening_hours')
        .select('*')
        .eq('day_of_week', dayOfWeek)
        .single()
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération des horaires:', response.error);
          return null;
        }
        return response.data as OpeningHours;
      })
    );
  }

  getAllOpeningHours(): Observable<OpeningHours[]> {
    return from(
      this.supabase.client
        .from('opening_hours')
        .select('*')
        .order('day_of_week', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) {
          console.error('Erreur lors de la récupération des horaires:', response.error);
          return [];
        }
        return response.data as OpeningHours[];
      })
    );
  }

  // ==================== CRÉNEAUX DISPONIBLES ====================

  /**
   * Disponibilité de plusieurs dates en une passe, pour l'écran de choix de la
   * date. Tout est récupéré en 4 requêtes quelle que soit la longueur de la
   * plage, au lieu de 4 par jour.
   */
  async getDatesAvailability(
    dates: string[],
    serviceId: string
  ): Promise<Map<string, DateAvailability>> {
    const result = new Map<string, DateAvailability>();
    if (!dates.length) return result;

    const from = dates[0];
    const to = dates[dates.length - 1];

    try {
      const [serviceRes, hoursRes, bookedRes, blockedRes] = await Promise.all([
        this.supabase.client.from('services').select('duration_minutes').eq('id', serviceId).single(),
        this.supabase.client.from('opening_hours').select('*'),
        this.supabase.client.rpc('get_booked_intervals_range', { p_from: from, p_to: to }),
        this.supabase.client.from('blocked_slots').select('date, start_time, end_time').gte('date', from).lte('date', to)
      ]);

      const duration = serviceRes.data?.duration_minutes;
      if (!duration) throw new Error('Service non trouvé');

      const hoursByDay = new Map<number, OpeningHours>();
      for (const row of (hoursRes.data as OpeningHours[]) ?? []) {
        hoursByDay.set(row.day_of_week, row);
      }

      const bookedByDate = new Map<string, { start_time: string; end_time: string }[]>();
      for (const row of (bookedRes.data as any[]) ?? []) {
        const key = String(row.booking_date).slice(0, 10);
        if (!bookedByDate.has(key)) bookedByDate.set(key, []);
        bookedByDate.get(key)!.push(row);
      }

      const blockedByDate = new Map<string, { start_time: string; end_time: string }[]>();
      for (const row of (blockedRes.data as any[]) ?? []) {
        const key = String(row.date).slice(0, 10);
        if (!blockedByDate.has(key)) blockedByDate.set(key, []);
        blockedByDate.get(key)!.push(row);
      }

      for (const date of dates) {
        const dayOfWeek = isoDayOfWeek(date);
        const hours = hoursByDay.get(dayOfWeek);

        if (!hours || hours.is_closed) {
          result.set(date, { available: false, reason: 'closed', slots: [] });
          continue;
        }

        const booked = bookedByDate.get(date) ?? [];
        const blocked = blockedByDate.get(date) ?? [];

        // Les créneaux déjà passés du jour même n'ont plus lieu d'être proposés
        const slots = this.filterPastSlots(
          date,
          this.generateTimeSlots(hours.start_time, hours.end_time, duration).map(time => ({
            time,
            available: !this.isSlotOccupied(time, booked, blocked, duration)
          }))
        );

        const remaining = slots.filter(s => s.available).length;

        if (remaining > 0) {
          result.set(date, { available: true, reason: null, slots });
        } else {
          // On distingue « bloqué par le salon » de « toutes les places prises »
          result.set(date, {
            available: false,
            reason: blocked.length ? 'blocked' : 'full',
            slots
          });
        }
      }

      return result;

    } catch (error) {
      console.error('Erreur lors du calcul des disponibilités:', error);
      // En cas d'échec on n'invente rien : aucune date n'est grisée
      return result;
    }
  }

  private generateTimeSlots(startTime: string, endTime: string, durationMinutes: number): string[] {
    const slots: string[] = [];
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    const interval = 30;

    for (let time = start; time + durationMinutes <= end; time += interval) {
      slots.push(this.minutesToTime(time));
    }

    return slots;
  }

  private isSlotOccupied(
    slotTime: string,
    bookings: any[],
    blocked: any[],
    durationMinutes: number
  ): boolean {
    const slotStart = this.timeToMinutes(slotTime);
    const slotEnd = slotStart + durationMinutes;

    for (const booking of bookings) {
      const bookingStart = this.timeToMinutes(booking.start_time);
      const bookingEnd = this.timeToMinutes(booking.end_time);
      if (this.slotsOverlap(slotStart, slotEnd, bookingStart, bookingEnd)) return true;
    }

    for (const block of blocked) {
      const blockStart = this.timeToMinutes(block.start_time);
      const blockEnd = this.timeToMinutes(block.end_time);
      if (this.slotsOverlap(slotStart, slotEnd, blockStart, blockEnd)) return true;
    }

    return false;
  }

  private slotsOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
    return start1 < end2 && end1 > start2;
  }

  private isToday(dateString: string): boolean {
    return dateString === todayString();
  }

  private filterPastSlots(date: string, slots: TimeSlot[]): TimeSlot[] {
    if (!this.isToday(date)) return slots;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return slots.filter(slot => this.timeToMinutes(slot.time) > currentMinutes);
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  // ==================== RÉSERVATIONS ====================

  /**
   * Contrôle de doublon délégué à Postgres : la table `bookings` n'est plus
   * lisible côté client, la RPC ne renvoie que le message à afficher.
   */
  private async checkActiveBooking(
    identifiers: { email?: string; phone?: string },
    targetDate: string
  ): Promise<{ hasActive: boolean; message?: string }> {
    const { data, error } = await this.supabase.client.rpc('has_active_booking', {
      p_email: identifiers.email ?? null,
      p_phone: identifiers.phone ?? null,
      p_date: targetDate || null
    });

    if (error) {
      console.error('Erreur lors de la vérification des réservations actives:', error);
      // On laisse passer : create_booking refera le contrôle, côté serveur
      return { hasActive: false };
    }

    return data ? { hasActive: true, message: data as string } : { hasActive: false };
  }

  async checkActiveBookingByPhone(
    phone: string,
    targetDate: string
  ): Promise<{ hasActive: boolean; message?: string }> {
    return this.checkActiveBooking({ phone: normalizePhone(phone) }, targetDate);
  }

  async checkActiveBookingByEmail(
    email: string,
    targetDate: string
  ): Promise<{ hasActive: boolean; message?: string }> {
    return this.checkActiveBooking({ email }, targetDate);
  }

  async createBooking(
    booking: BookingRequest,
    isAuthenticatedUser = false
  ): Promise<{ success: boolean; booking?: Booking; error?: string }> {
    try {
      // Pré-contrôle purement UX : la RPC refait les mêmes vérifications, de
      // façon autoritaire cette fois, puisque le client n'écrit plus en direct.
      const activeCheck = isAuthenticatedUser && booking.client_email
        ? await this.checkActiveBookingByEmail(booking.client_email, booking.booking_date)
        : await this.checkActiveBookingByPhone(booking.client_phone, booking.booking_date);

      if (activeCheck.hasActive) {
        return { success: false, error: activeCheck.message };
      }

      const { data, error } = await this.supabase.client.rpc('create_booking', {
        p_service_id: booking.service_id,
        p_client_name: booking.client_name,
        p_client_phone: booking.client_phone,
        p_client_email: booking.client_email,
        p_booking_date: booking.booking_date,
        p_start_time: booking.start_time,
        p_whatsapp_notification: booking.whatsapp_notification,
        p_notes: booking.notes ?? null
      });

      if (error) {
        return { success: false, error: this.translateBookingError(error) };
      }

      // La RPC ne renvoie que l'identifiant : c'est la seule donnée que le
      // parcours de confirmation utilise.
      return { success: true, booking: { id: data as string } as Booking };

    } catch (error: any) {
      console.error('Erreur lors de la création de la réservation:', error);
      return { success: false, error: 'Une erreur est survenue lors de la réservation.' };
    }
  }

  /** Les RAISE EXCEPTION de create_booking portent déjà un message lisible. */
  private translateBookingError(error: { code?: string; message?: string }): string {
    const businessCodes = ['P0002', 'P0003', 'P0004'];
    if (error.code && businessCodes.includes(error.code) && error.message) {
      return error.message;
    }
    console.error('Erreur lors de la création de la réservation:', error);
    return 'Une erreur est survenue lors de la réservation.';
  }

  async confirmBooking(bookingId: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId);

    return !error;
  }

  /**
   * Réservé à un client connecté dont l'email correspond, ou à un admin :
   * depuis la fermeture de la lecture publique, un appel anonyme renvoie [].
   */
  async getBookingsByPhone(phone: string): Promise<Booking[]> {
    const normalizedPhone = normalizePhone(phone);

    const { data, error } = await this.supabase.client
      .from('bookings')
      .select('*, services(name, duration_minutes)')
      .eq('client_phone', normalizedPhone)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error || !data) return [];
    return data as Booking[];
  }

  /**
   * Réservations d'une cliente connectée.
   *
   * Le rattachement se fait par identifiant de compte : filtrer sur l'e-mail
   * seul ferait disparaître tout l'historique dès un changement d'adresse.
   * L'e-mail reste en second critère pour les réservations prises en invitée
   * avec la même adresse, avant la création du compte — elles n'ont pas de
   * `user_id`. Les deux branches correspondent à la policy RLS.
   */
  async getMyBookings(userId: string, email: string): Promise<Booking[]> {
    const filters: string[] = [];
    if (userId) filters.push(`user_id.eq.${userId}`);
    if (email) filters.push(`client_email.eq.${email}`);
    if (!filters.length) return [];

    const { data, error } = await this.supabase.client
      .from('bookings')
      .select('*, services(name, duration_minutes)')
      .or(filters.join(','))
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error || !data) {
      if (error) console.error('Erreur lors de la récupération des réservations:', error);
      return [];
    }
    return data as Booking[];
  }

  async cancelBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.supabase.client
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)
      .select('id');

    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) {
      return { success: false, error: 'La réservation n\'a pas pu être annulée. Veuillez réessayer.' };
    }
    return { success: true };
  }

  // ==================== GESTION DE L'ÉTAT ====================

  updateBookingState(updates: Partial<BookingState>): void {
    const currentState = this.bookingStateSubject.value;
    this.bookingStateSubject.next({ ...currentState, ...updates });
  }

  resetBookingState(): void {
    this.bookingStateSubject.next({
      selectedService: null,
      selectedDate: null,
      selectedTime: null,
      clientInfo: null,
      currentStep: 1
    });
  }

  getCurrentState(): BookingState {
    return this.bookingStateSubject.value;
  }
}
