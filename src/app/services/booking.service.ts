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
  DateAvailability
} from '../models/booking.model';
import { RealtimeChannel } from '@supabase/supabase-js';

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

  private availableSlotsCache = new Map<string, { slots: TimeSlot[], timestamp: number }>();
  private CACHE_DURATION = 30000;

  private realtimeChannel: RealtimeChannel | null = null;

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

  async getAvailableSlots(date: string, serviceId: string): Promise<TimeSlot[]> {
    const cacheKey = `${date}-${serviceId}`;
    const cached = this.availableSlotsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return this.filterPastSlots(date, cached.slots);
    }

    try {
      const { data: service } = await this.supabase.client
        .from('services')
        .select('duration_minutes')
        .eq('id', serviceId)
        .single();

      if (!service) throw new Error('Service non trouvé');

      const dayOfWeek = new Date(date).getDay() || 7;
      const { data: hours } = await this.supabase.client
        .from('opening_hours')
        .select('*')
        .eq('day_of_week', dayOfWeek)
        .single();

      if (!hours || hours.is_closed) return [];

      const allSlots = this.generateTimeSlots(
        hours.start_time,
        hours.end_time,
        service.duration_minutes
      );

      // RPC et non lecture directe : la table `bookings` n'est plus lisible
      // publiquement, cette fonction ne renvoie que des intervalles horaires.
      const { data: bookings } = await this.supabase.client
        .rpc('get_booked_intervals', { p_date: date });

      const { data: blocked } = await this.supabase.client
        .from('blocked_slots')
        .select('start_time, end_time')
        .eq('date', date);

      const availableSlots = allSlots.map(slot => ({
        time: slot,
        available: !this.isSlotOccupied(slot, bookings || [], blocked || [], service.duration_minutes),
        isPending: false
      }));

      this.availableSlotsCache.set(cacheKey, {
        slots: availableSlots,
        timestamp: Date.now()
      });

      return this.filterPastSlots(date, availableSlots);

    } catch (error) {
      console.error('Erreur lors de la récupération des créneaux:', error);
      return [];
    }
  }

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
        const dayOfWeek = new Date(date + 'T00:00:00').getDay() || 7;
        const hours = hoursByDay.get(dayOfWeek);

        if (!hours || hours.is_closed) {
          result.set(date, { available: false, reason: 'closed', slots: 0 });
          continue;
        }

        const booked = bookedByDate.get(date) ?? [];
        const blocked = blockedByDate.get(date) ?? [];

        const slots = this.generateTimeSlots(hours.start_time, hours.end_time, duration)
          .map(time => ({
            time,
            available: !this.isSlotOccupied(time, booked, blocked, duration)
          }));

        const remaining = this.filterPastSlots(date, slots).filter(s => s.available).length;

        if (remaining > 0) {
          result.set(date, { available: true, reason: null, slots: remaining });
        } else {
          // On distingue « bloqué par le salon » de « toutes les places prises »
          result.set(date, {
            available: false,
            reason: blocked.length ? 'blocked' : 'full',
            slots: 0
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
    const today = new Date();
    const date = new Date(dateString);
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
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

      this.invalidateCache(booking.booking_date, booking.service_id);
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

  // ==================== TEMPS RÉEL ====================

  subscribeToBookings(date: string, callback: () => void): void {
    this.realtimeChannel = this.supabase.subscribeToTable(
      'bookings',
      (_payload) => {
        this.availableSlotsCache.clear();
        callback();
      },
      `booking_date=eq.${date}`
    );
  }

  unsubscribeFromBookings(): void {
    if (this.realtimeChannel) {
      this.supabase.unsubscribe(this.realtimeChannel);
      this.realtimeChannel = null;
    }
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

  // ==================== CACHE ====================

  private invalidateCache(date: string, serviceId: string): void {
    const cacheKey = `${date}-${serviceId}`;
    this.availableSlotsCache.delete(cacheKey);
  }

  clearCache(): void {
    this.availableSlotsCache.clear();
  }
}
