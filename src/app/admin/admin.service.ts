import { Injectable } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';
import { BlockedSlot, Booking, BookingStatus, OpeningHours, Service } from '../models/booking.model';

export interface AdminStats {
  pending: number;
  confirmed: number;
  today: number;
  upcoming: number;
}

export type AdminResult = { success: boolean; error?: string };

/** Une ligne par date d'inscription (cf. supabase-client-stats.sql) */
export interface ClientSignup {
  signup_date: string;
  verified_count: number;
  unverified_count: number;
}

/** Un compte client inscrit (cf. supabase-client-stats.sql) */
export interface ClientRow {
  client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  /** null pour les comptes créés avant l'ajout du champ */
  gender: 'homme' | 'femme' | null;
  signed_up_at: string;
  email_verified: boolean;
}

/**
 * Accès aux données réservés à l'admin.
 *
 * Volontairement séparé de BookingService : ce service n'est référencé que par
 * les composants du dossier `admin/`, il part donc dans le chunk lazy et n'est
 * jamais téléchargé par un client.
 *
 * Toutes les écritures ci-dessous ne passent que si les policies RLS
 * `public.is_admin()` les autorisent — le contrôle final est côté serveur.
 */
@Injectable()
export class AdminService {
  constructor(private supabase: SupabaseService) {}

  private fail(error: unknown, fallback: string): AdminResult {
    console.error(fallback, error);
    const message = (error as { message?: string })?.message;
    return { success: false, error: message || fallback };
  }

  // ==================== RÉSERVATIONS ====================

  async getBookings(): Promise<Booking[]> {
    const { data, error } = await this.supabase.client
      .from('bookings')
      // `price` alimente les statistiques comptables
      .select('*, services(name, duration_minutes, price)')
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des réservations:', error);
      return [];
    }
    return data as Booking[];
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus): Promise<AdminResult> {
    const { data, error } = await this.supabase.client
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .select('id');

    if (error) return this.fail(error, 'Impossible de mettre à jour la réservation.');
    if (!data || data.length === 0) {
      return { success: false, error: 'Mise à jour refusée. Vérifiez vos droits administrateur.' };
    }
    return { success: true };
  }

  async deleteBooking(bookingId: string): Promise<AdminResult> {
    const { error } = await this.supabase.client
      .from('bookings')
      .delete()
      .eq('id', bookingId);

    if (error) return this.fail(error, 'Impossible de supprimer la réservation.');
    return { success: true };
  }

  computeStats(bookings: Booking[]): AdminStats {
    const today = new Date().toISOString().split('T')[0];
    return {
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      today: bookings.filter(
        b => b.booking_date === today && ['pending', 'confirmed'].includes(b.status)
      ).length,
      upcoming: bookings.filter(
        b => b.booking_date > today && ['pending', 'confirmed'].includes(b.status)
      ).length
    };
  }

  // ==================== CLIENTÈLE ====================

  /**
   * Inscriptions agrégées par date. Passe par une RPC : le statut de
   * confirmation vit dans `auth.users`, hors de portée du client.
   */
  async getClientSignups(): Promise<ClientSignup[]> {
    const { data, error } = await this.supabase.client.rpc('get_client_signups');

    if (error || !data) {
      console.error('Erreur lors de la récupération des inscriptions:', error);
      return [];
    }
    return data as ClientSignup[];
  }

  /** Liste nominative des comptes clients (admins exclus côté SQL). */
  async getClients(): Promise<ClientRow[]> {
    const { data, error } = await this.supabase.client.rpc('get_clients');

    if (error || !data) {
      console.error('Erreur lors de la récupération des clients:', error);
      return [];
    }
    return data as ClientRow[];
  }

  // ==================== IMAGES DE PRESTATIONS ====================

  static readonly IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  /** Doit rester aligné sur `allowed_mime_types` du bucket service-images. */
  static readonly IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];
  static readonly IMAGE_ACCEPT = 'image/jpeg,image/png';

  private readonly bucket = 'service-images';

  /**
   * Contrôle préalable au téléversement.
   *
   * Le bucket applique les mêmes limites côté serveur : ce contrôle-ci ne sert
   * qu'à donner un message clair sans attendre l'aller-retour réseau.
   */
  validateImage(file: File): string | null {
    if (!AdminService.IMAGE_MIME_TYPES.includes(file.type)) {
      return 'Format non accepté. Seules les images JPG et PNG sont autorisées.';
    }
    if (file.size > AdminService.IMAGE_MAX_BYTES) {
      const size = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
      return `Image trop lourde (${size} Mo). La limite est de 5 Mo.`;
    }
    return null;
  }

  async uploadServiceImage(file: File): Promise<{ url?: string; error?: string }> {
    const invalid = this.validateImage(file);
    if (invalid) return { error: invalid };

    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
    // Nom aléatoire : deux fichiers homonymes ne doivent pas s'écraser
    const path = `${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.client.storage
      .from(this.bucket)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('Erreur lors du téléversement de l\'image:', error);
      // Le bucket renvoie ce message quand la limite serveur est dépassée
      if (error.message?.includes('exceeded the maximum allowed size')) {
        return { error: 'Image trop lourde. La limite est de 5 Mo.' };
      }
      return { error: 'Le téléversement de l\'image a échoué.' };
    }

    const { data } = this.supabase.client.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl };
  }

  /**
   * Supprime un fichier du bucket à partir de son URL publique.
   * Best-effort : un échec ne doit pas bloquer l'opération métier en cours.
   */
  async deleteServiceImage(url: string | null | undefined): Promise<void> {
    if (!url) return;

    const marker = `/${this.bucket}/`;
    const index = url.indexOf(marker);
    if (index === -1) return;

    const path = url.slice(index + marker.length).split('?')[0];
    if (!path) return;

    const { error } = await this.supabase.client.storage.from(this.bucket).remove([path]);
    if (error) console.error('Suppression de l\'ancienne image impossible:', error);
  }

  // ==================== PRESTATIONS ====================

  /** Contrairement au front public, on récupère aussi les prestations désactivées. */
  async getServices(): Promise<Service[]> {
    const { data, error } = await this.supabase.client
      .from('services')
      .select('*')
      .order('name', { ascending: true });

    if (error || !data) {
      console.error('Erreur lors de la récupération des prestations:', error);
      return [];
    }
    return data as Service[];
  }

  async createService(service: Partial<Service>): Promise<AdminResult> {
    const { error } = await this.supabase.client.from('services').insert(service);
    if (error) return this.fail(error, 'Impossible de créer la prestation.');
    return { success: true };
  }

  async updateService(id: string, changes: Partial<Service>): Promise<AdminResult> {
    const { data, error } = await this.supabase.client
      .from('services')
      .update(changes)
      .eq('id', id)
      .select('id');

    if (error) return this.fail(error, 'Impossible de modifier la prestation.');
    if (!data || data.length === 0) {
      return { success: false, error: 'Modification refusée. Vérifiez vos droits administrateur.' };
    }
    return { success: true };
  }

  async deleteService(id: string): Promise<AdminResult> {
    const { error } = await this.supabase.client.from('services').delete().eq('id', id);
    if (error) {
      // 23503 = clé étrangère : des réservations pointent encore sur cette prestation
      if ((error as { code?: string }).code === '23503') {
        return {
          success: false,
          error: 'Des réservations utilisent cette prestation. Désactivez-la plutôt que de la supprimer.'
        };
      }
      return this.fail(error, 'Impossible de supprimer la prestation.');
    }
    return { success: true };
  }

  // ==================== HORAIRES ====================

  async getOpeningHours(): Promise<OpeningHours[]> {
    const { data, error } = await this.supabase.client
      .from('opening_hours')
      .select('*')
      .order('day_of_week', { ascending: true });

    if (error || !data) {
      console.error('Erreur lors de la récupération des horaires:', error);
      return [];
    }
    return data as OpeningHours[];
  }

  async updateOpeningHours(id: string, changes: Partial<OpeningHours>): Promise<AdminResult> {
    const { data, error } = await this.supabase.client
      .from('opening_hours')
      .update(changes)
      .eq('id', id)
      .select('id');

    if (error) return this.fail(error, 'Impossible de modifier les horaires.');
    if (!data || data.length === 0) {
      return { success: false, error: 'Modification refusée. Vérifiez vos droits administrateur.' };
    }
    return { success: true };
  }

  // ==================== CRÉNEAUX BLOQUÉS ====================

  async getBlockedSlots(): Promise<BlockedSlot[]> {
    const { data, error } = await this.supabase.client
      .from('blocked_slots')
      .select('*')
      .order('date', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des indisponibilités:', error);
      return [];
    }
    return data as BlockedSlot[];
  }

  async createBlockedSlot(slot: Partial<BlockedSlot>): Promise<AdminResult> {
    const { error } = await this.supabase.client.from('blocked_slots').insert(slot);
    if (error) return this.fail(error, 'Impossible de créer l\'indisponibilité.');
    return { success: true };
  }

  async deleteBlockedSlot(id: string): Promise<AdminResult> {
    const { error } = await this.supabase.client.from('blocked_slots').delete().eq('id', id);
    if (error) return this.fail(error, 'Impossible de supprimer l\'indisponibilité.');
    return { success: true };
  }
}
