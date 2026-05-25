import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { 
  Service, 
  Booking, 
  BookingRequest, 
  TimeSlot, 
  OpeningHours,
  BlockedSlot,
  BookingState 
} from '../models/booking.model';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  // État de la réservation en cours
  private bookingStateSubject = new BehaviorSubject<BookingState>({
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    clientInfo: null,
    currentStep: 1
  });

  public bookingState$ = this.bookingStateSubject.asObservable();

  // Cache des créneaux disponibles
  private availableSlotsCache = new Map<string, { slots: TimeSlot[], timestamp: number }>();
  private CACHE_DURATION = 30000; // 30 secondes

  private realtimeChannel: RealtimeChannel | null = null;

  constructor(private supabase: SupabaseService) {}

  // ==================== SERVICES ====================

  /**
   * Récupère tous les services actifs
   */
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

  /**
   * Récupère les horaires d'ouverture d'un jour spécifique
   */
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

  // ==================== CRÉNEAUX DISPONIBLES ====================

  /**
   * Récupère les créneaux disponibles pour une date et un service
   */
  async getAvailableSlots(date: string, serviceId: string): Promise<TimeSlot[]> {
    const cacheKey = `${date}-${serviceId}`;
    const cached = this.availableSlotsCache.get(cacheKey);

    // Vérifier le cache
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.slots;
    }

    try {
      // 1. Récupérer le service pour connaître la durée
      const { data: service } = await this.supabase.client
        .from('services')
        .select('duration_minutes')
        .eq('id', serviceId)
        .single();

      if (!service) {
        throw new Error('Service non trouvé');
      }

      // 2. Récupérer les horaires d'ouverture
      const dayOfWeek = new Date(date).getDay() || 7; // Dimanche = 7
      const { data: hours } = await this.supabase.client
        .from('opening_hours')
        .select('*')
        .eq('day_of_week', dayOfWeek)
        .single();

      if (!hours || hours.is_closed) {
        return [];
      }

      // 3. Générer tous les créneaux possibles
      const allSlots = this.generateTimeSlots(
        hours.start_time,
        hours.end_time,
        service.duration_minutes
      );

      // 4. Récupérer les réservations existantes
      const { data: bookings } = await this.supabase.client
        .from('bookings')
        .select('start_time, end_time')
        .eq('booking_date', date)
        .in('status', ['pending', 'confirmed']);

      // 5. Récupérer les créneaux bloqués
      const { data: blocked } = await this.supabase.client
        .from('blocked_slots')
        .select('start_time, end_time')
        .eq('date', date);

      // 6. Filtrer les créneaux disponibles
      const availableSlots = allSlots.map(slot => ({
        time: slot,
        available: !this.isSlotOccupied(slot, bookings || [], blocked || [], service.duration_minutes),
        isPending: false
      }));

      // Mettre en cache
      this.availableSlotsCache.set(cacheKey, {
        slots: availableSlots,
        timestamp: Date.now()
      });

      return availableSlots;

    } catch (error) {
      console.error('Erreur lors de la récupération des créneaux:', error);
      return [];
    }
  }

  /**
   * Génère une liste de créneaux horaires
   */
  private generateTimeSlots(startTime: string, endTime: string, durationMinutes: number): string[] {
    const slots: string[] = [];
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    const interval = 30; // Créneaux toutes les 30 minutes

    for (let time = start; time + durationMinutes <= end; time += interval) {
      slots.push(this.minutesToTime(time));
    }

    return slots;
  }

  /**
   * Vérifie si un créneau est occupé
   */
  private isSlotOccupied(
    slotTime: string,
    bookings: any[],
    blocked: any[],
    durationMinutes: number
  ): boolean {
    const slotStart = this.timeToMinutes(slotTime);
    const slotEnd = slotStart + durationMinutes;

    // Vérifier les réservations
    for (const booking of bookings) {
      const bookingStart = this.timeToMinutes(booking.start_time);
      const bookingEnd = this.timeToMinutes(booking.end_time);

      if (this.slotsOverlap(slotStart, slotEnd, bookingStart, bookingEnd)) {
        return true;
      }
    }

    // Vérifier les créneaux bloqués
    for (const block of blocked) {
      const blockStart = this.timeToMinutes(block.start_time);
      const blockEnd = this.timeToMinutes(block.end_time);

      if (this.slotsOverlap(slotStart, slotEnd, blockStart, blockEnd)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Vérifie si deux créneaux se chevauchent
   */
  private slotsOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Convertit une heure en minutes
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convertit des minutes en heure
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  // ==================== RÉSERVATIONS ====================

  /**
   * Crée une nouvelle réservation
   */
  async createBooking(booking: BookingRequest): Promise<{ success: boolean; booking?: Booking; error?: string }> {
    try {
      // Récupérer le service pour calculer l'heure de fin
      const { data: service } = await this.supabase.client
        .from('services')
        .select('duration_minutes')
        .eq('id', booking.service_id)
        .single();

      if (!service) {
        return { success: false, error: 'Service non trouvé' };
      }

      const startMinutes = this.timeToMinutes(booking.start_time);
      const endTime = this.minutesToTime(startMinutes + service.duration_minutes);

      const newBooking: Partial<Booking> = {
        ...booking,
        end_time: endTime,
        status: 'pending',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      };

      const { data, error } = await this.supabase.client
        .from('bookings')
        .insert(newBooking)
        .select()
        .single();

      if (error) {
        // Gérer les erreurs de contrainte unique (double réservation)
        if (error.code === '23505') {
          return { success: false, error: 'Ce créneau vient d\'être réservé par quelqu\'un d\'autre' };
        }
        return { success: false, error: error.message };
      }

      // Invalider le cache
      this.invalidateCache(booking.booking_date, booking.service_id);

      return { success: true, booking: data as Booking };

    } catch (error: any) {
      console.error('Erreur lors de la création de la réservation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Confirme une réservation (change le status de pending à confirmed)
   */
  async confirmBooking(bookingId: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId);

    return !error;
  }

  // ==================== TEMPS RÉEL ====================

  /**
   * S'abonne aux changements de réservations pour une date spécifique
   */
  subscribeToBookings(date: string, callback: () => void): void {
    this.realtimeChannel = this.supabase.subscribeToTable(
      'bookings',
      (payload) => {
        console.log('Changement détecté:', payload);
        // Invalider le cache
        this.availableSlotsCache.clear();
        callback();
      },
      `booking_date=eq.${date}`
    );
  }

  /**
   * Se désabonne des changements en temps réel
   */
  unsubscribeFromBookings(): void {
    if (this.realtimeChannel) {
      this.supabase.unsubscribe(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  // ==================== GESTION DE L'ÉTAT ====================

  /**
   * Met à jour l'état de la réservation
   */
  updateBookingState(updates: Partial<BookingState>): void {
    const currentState = this.bookingStateSubject.value;
    this.bookingStateSubject.next({ ...currentState, ...updates });
  }

  /**
   * Réinitialise l'état de la réservation
   */
  resetBookingState(): void {
    this.bookingStateSubject.next({
      selectedService: null,
      selectedDate: null,
      selectedTime: null,
      clientInfo: null,
      currentStep: 1
    });
  }

  /**
   * Récupère l'état actuel
   */
  getCurrentState(): BookingState {
    return this.bookingStateSubject.value;
  }

  // ==================== CACHE ====================

  /**
   * Invalide le cache pour une date et un service
   */
  private invalidateCache(date: string, serviceId: string): void {
    const cacheKey = `${date}-${serviceId}`;
    this.availableSlotsCache.delete(cacheKey);
  }

  /**
   * Vide tout le cache
   */
  clearCache(): void {
    this.availableSlotsCache.clear();
  }
}
