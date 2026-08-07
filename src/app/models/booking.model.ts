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
  /** Catégorie de rattachement. NULL = non classée. */
  category_id: string | null;
  active: boolean;
  created_at: string;
}

export interface Promotion {
  id: string;
  name: string;
  discount_percent: number;
  /**
   * Prestations visées. **Liste vide = toutes les prestations.**
   *
   * Reflet de la table de liaison `promotion_services` : aucune ligne
   * rattachée signifie que la promotion vaut partout.
   */
  service_ids: string[];
  starts_on: string;
  ends_on: string;
  active: boolean;
  created_at: string;
}

/** Prix d'une prestation, remise éventuelle appliquée. */
export interface PricedService {
  /** Prix public, avant remise */
  basePrice: number;
  /** Montant réellement dû */
  finalPrice: number;
  discountPercent: number;
  promotionName: string | null;
}

export interface ServiceCategory {
  id: string;
  name: string;
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
  /** Compte ayant réservé. NULL pour une réservation prise sans être connecté. */
  user_id?: string | null;
  /**
   * Civilité de la cliente ou du client, rapprochée du profil côté application.
   * Ce n'est pas une colonne de `bookings` : elle reste null pour une
   * réservation prise en invité, faute de compte auquel la rattacher.
   */
  client_gender?: 'homme' | 'femme' | null;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  /**
   * Prestation principale — la plus longue du rendez-vous. Conservée pour
   * nommer la réservation là où une seule peut tenir.
   * `price` n'est renseigné que par les requêtes admin qui le demandent.
   */
  services?: { name: string; duration_minutes: number; price?: number } | null;
  /**
   * Toutes les prestations du rendez-vous, dans l'ordre choisi.
   * Absent des requêtes qui ne les demandent pas.
   */
  booking_services?: BookingLine[];
}

/** Une prestation d'un rendez-vous qui en compte plusieurs. */
export interface BookingLine {
  service_id: string;
  /** Prix figé de cette ligne. Leur somme vaut `Booking.price_at_booking`. */
  price_at_booking: number | null;
  duration_minutes: number;
  position: number;
  /**
   * Prestation réellement réalisée. `false` quand la cliente y a renoncé au
   * dernier moment : la ligne est conservée pour garder la trace de ce qui
   * avait été réservé.
   */
  fulfilled?: boolean;
  services?: { name: string } | null;
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
  /**
   * Créneaux de la journée, horaires déjà passés exclus.
   *
   * Ils sont calculés en même temps que la disponibilité de la date, et non
   * relus au moment du clic : c'est la même donnée, la recalculer coûterait un
   * aller-retour réseau pour un résultat identique.
   */
  slots: TimeSlot[];
}

export interface BookingRequest {
  /** Une ou plusieurs prestations, dans l'ordre d'exécution souhaité. */
  service_ids: string[];
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
  /**
   * Prestations retenues, dans l'ordre d'ajout. Vide tant que rien n'est
   * choisi — un rendez-vous peut en compter plusieurs.
   */
  selectedServices: Service[];
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
