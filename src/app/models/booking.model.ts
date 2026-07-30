// Models pour l'application de réservation

export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  /** Pictogramme historique, remplacé par `image_url` */
  icon: string | null;
  /** URL publique de la photo (bucket service-images) */
  image_url: string | null;
  active: boolean;
  created_at: string;
}

export interface OpeningHours {
  id: string;
  day_of_week: number; // 1-7 (Lundi-Dimanche)
  start_time: string;
  end_time: string;
  is_closed: boolean;
  created_at: string;
}

export interface Booking {
  id?: string;
  service_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  booking_date: string; // Format: YYYY-MM-DD
  start_time: string;
  end_time: string;
  status: BookingStatus;
  whatsapp_notification: boolean;
  notes?: string;
  /** Tarif figé à la création. Source de vérité du CA — ne jamais recalculer. */
  price_at_booking?: number | null;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  // `price` n'est renseigné que par les requêtes admin qui le demandent
  services?: { name: string; duration_minutes: number; price?: number } | null;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface BlockedSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_at: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  isPending?: boolean;
}

/** Pourquoi une date est proposée ou non à la réservation */
export type UnavailabilityReason = 'closed' | 'blocked' | 'full';

export interface DateAvailability {
  available: boolean;
  reason: UnavailabilityReason | null;
  /** Nombre de créneaux encore libres */
  slots: number;
}

export interface BookingRequest {
  service_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  booking_date: string;
  start_time: string;
  whatsapp_notification: boolean;
  notes?: string;
}

export interface AvailableSlotsRequest {
  date: string;
  service_id: string;
}

// DTO pour l'état de la réservation en cours
export interface BookingState {
  selectedService: Service | null;
  selectedDate: string | null;
  selectedTime: string | null;
  clientInfo: {
    name: string;
    phone: string;
    email: string;
    whatsappNotification: boolean;
  } | null;
  currentStep: number;
}
