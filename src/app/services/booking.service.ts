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
  BookingState
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

      const { data: bookings } = await this.supabase.client
        .from('bookings')
        .select('start_time, end_time')
        .eq('booking_date', date)
        .in('status', ['pending', 'confirmed']);

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

  async checkActiveBookingByPhone(
    phone: string,
    targetDate: string
  ): Promise<{ hasActive: boolean; message?: string }> {
    const normalized = normalizePhone(phone);

    const { data } = await this.supabase.client
      .from('bookings')
      .select('id, booking_date, status')
      .eq('client_phone', normalized)
      .neq('status', 'cancelled');

    if (!data || data.length === 0) return { hasActive: false };

    if (data.some(b => ['pending'].includes(b.status))) {
      return {
        hasActive: true,
        message: 'Ce numéro a déjà une réservation en attente.'
      };
    }
    if (targetDate && data.some(b => b.booking_date === targetDate)) {
      return {
        hasActive: true,
        message: 'Ce numéro a déjà une réservation prévue à cette date.'
      };
    }
    return { hasActive: false };
  }

  async checkActiveBookingByEmail(
    email: string,
    targetDate: string
  ): Promise<{ hasActive: boolean; message?: string }> {
    const { data } = await this.supabase.client
      .from('bookings')
      .select('id, booking_date, status')
      .eq('client_email', email)
      .neq('status', 'cancelled');

    if (!data || data.length === 0) return { hasActive: false };

    if (data.some(b => ['pending'].includes(b.status))) {
      return {
        hasActive: true,
        message: 'Vous avez déjà une réservation en attente.'
      };
    }
    if (targetDate && data.some(b => b.booking_date === targetDate)) {
      return {
        hasActive: true,
        message: 'Vous avez déjà une réservation prévue à cette date.'
      };
    }
    return { hasActive: false };
  }

  async createBooking(
    booking: BookingRequest,
    isAuthenticatedUser = false
  ): Promise<{ success: boolean; booking?: Booking; error?: string }> {
    try {
      const activeCheck = isAuthenticatedUser && booking.client_email
        ? await this.checkActiveBookingByEmail(booking.client_email, booking.booking_date)
        : await this.checkActiveBookingByPhone(booking.client_phone, booking.booking_date);

      if (activeCheck.hasActive) {
        return { success: false, error: activeCheck.message };
      }

      const { data: service } = await this.supabase.client
        .from('services')
        .select('duration_minutes')
        .eq('id', booking.service_id)
        .single();

      if (!service) return { success: false, error: 'Service non trouvé' };

      const startMinutes = this.timeToMinutes(booking.start_time);
      const endTime = this.minutesToTime(startMinutes + service.duration_minutes);

      const newBooking: Partial<Booking> = {
        ...booking,
        end_time: endTime,
        status: 'pending'
      };

      const { data, error } = await this.supabase.client
        .from('bookings')
        .insert(newBooking)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'Ce créneau vient d\'être réservé par quelqu\'un d\'autre' };
        }
        return { success: false, error: error.message };
      }

      this.invalidateCache(booking.booking_date, booking.service_id);
      return { success: true, booking: data as Booking };

    } catch (error: any) {
      console.error('Erreur lors de la création de la réservation:', error);
      return { success: false, error: error.message };
    }
  }

  async confirmBooking(bookingId: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId);

    return !error;
  }

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

  async getBookingsByEmail(email: string): Promise<Booking[]> {
    const { data, error } = await this.supabase.client
      .from('bookings')
      .select('*, services(name, duration_minutes)')
      .eq('client_email', email)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error || !data) return [];
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
