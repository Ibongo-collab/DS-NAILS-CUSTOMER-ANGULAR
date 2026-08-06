import { Injectable } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';
import {
  BlockedSlot,
  Booking,
  BookingStatus,
  OpeningHours,
  Service,
  ServiceCategory,
  Promotion
} from '../models/booking.model';
import { todayString } from '../utils/date';

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

export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'simulated' | 'skipped';

/** Une ligne du journal d'envoi (cf. supabase-notifications.sql) */
export interface NotificationRow {
  id: string;
  booking_id: string | null;
  event: string;
  audience: 'admin' | 'client';
  channel: string;
  recipient: string | null;
  message: string;
  status: NotificationStatus;
  error: string | null;
  attempts: number;
  created_at: string;
  processed_at: string | null;
}

export interface NotificationSettings {
  id: boolean;
  admin_phone: string | null;
  notify_admin: boolean;
  notify_client: boolean;
  updated_at: string;
}

type ProfileGender = 'homme' | 'femme' | null;

interface ProfileRow {
  id: string;
  email: string | null;
  gender: ProfileGender;
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
    // La civilité vit dans `profiles`, mais la clé étrangère de `user_id`
    // pointe vers `auth.users` : PostgREST ne sait donc pas imbriquer les deux.
    // On récupère les profils en parallèle et on rapproche côté application.
    const [bookingsRes, profilesRes] = await Promise.all([
      this.supabase.client
        .from('bookings')
        // `price` alimente les statistiques comptables
        .select('*, services(name, duration_minutes, price)')
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false }),
      this.supabase.client.from('profiles').select('id, email, gender')
    ]);

    if (bookingsRes.error || !bookingsRes.data) {
      console.error('Erreur lors de la récupération des réservations:', bookingsRes.error);
      return [];
    }

    const bookings = bookingsRes.data as Booking[];
    if (profilesRes.error) {
      // Sans les profils, les libellés resteront neutres : ce n'est pas une
      // raison de priver l'écran de ses réservations.
      console.error('Erreur lors de la récupération des profils:', profilesRes.error);
      return bookings;
    }

    const byId = new Map<string, ProfileGender>();
    const byEmail = new Map<string, ProfileGender>();

    for (const profile of (profilesRes.data as ProfileRow[]) ?? []) {
      if (profile.id) byId.set(profile.id, profile.gender ?? null);
      if (profile.email) byEmail.set(profile.email.toLowerCase(), profile.gender ?? null);
    }

    for (const booking of bookings) {
      // Le compte d'abord, l'adresse en secours pour les réservations
      // antérieures au rattachement par identifiant
      const fromAccount = booking.user_id ? byId.get(booking.user_id) : undefined;
      const fromEmail = byEmail.get((booking.client_email || '').toLowerCase());
      booking.client_gender = fromAccount ?? fromEmail ?? null;
    }

    return bookings;
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

  // Aucune méthode de suppression de réservation, volontairement : l'historique
  // fonde le chiffre d'affaires et la comptabilité. Une réservation qui n'a pas
  // lieu passe au statut « annulée » et reste consultable.
  // La base l'interdit également (cf. supabase-protect-bookings.sql).

  computeStats(bookings: Booking[]): AdminStats {
    const today = todayString();
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

  // ==================== NOTIFICATIONS ====================

  async getNotifications(limit = 100): Promise<NotificationRow[]> {
    const { data, error } = await this.supabase.client
      .from('notification_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      console.error('Erreur lors de la récupération des notifications:', error);
      return [];
    }
    return data as NotificationRow[];
  }

  async getNotificationSettings(): Promise<NotificationSettings | null> {
    const { data, error } = await this.supabase.client
      .from('notification_settings')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Erreur lors de la récupération des réglages:', error);
      return null;
    }
    return (data as NotificationSettings) ?? null;
  }

  async updateNotificationSettings(changes: Partial<NotificationSettings>): Promise<AdminResult> {
    const { data, error } = await this.supabase.client
      .from('notification_settings')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select('id');

    if (error) return this.fail(error, 'Impossible d\'enregistrer les réglages.');
    if (!data || data.length === 0) {
      return { success: false, error: 'Enregistrement refusé. Vérifiez vos droits administrateur.' };
    }
    return { success: true };
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

  // ==================== CATÉGORIES ====================

  async getCategories(): Promise<ServiceCategory[]> {
    const { data, error } = await this.supabase.client
      .from('service_categories')
      .select('*')
      .order('name', { ascending: true });

    if (error || !data) {
      console.error('Erreur lors de la récupération des catégories:', error);
      return [];
    }
    return data as ServiceCategory[];
  }

  async createCategory(name: string): Promise<AdminResult> {
    const { error } = await this.supabase.client
      .from('service_categories')
      .insert({ name });

    if (error) {
      // 23505 = index unique : une catégorie du même nom existe déjà
      if ((error as { code?: string }).code === '23505') {
        return { success: false, error: 'Une catégorie porte déjà ce nom.' };
      }
      return this.fail(error, 'Impossible de créer la catégorie.');
    }
    return { success: true };
  }

  async renameCategory(id: string, name: string): Promise<AdminResult> {
    const { data, error } = await this.supabase.client
      .from('service_categories')
      .update({ name })
      .eq('id', id)
      .select('id');

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return { success: false, error: 'Une catégorie porte déjà ce nom.' };
      }
      return this.fail(error, 'Impossible de renommer la catégorie.');
    }
    if (!data || data.length === 0) {
      return { success: false, error: 'Modification refusée. Vérifiez vos droits administrateur.' };
    }
    return { success: true };
  }

  /** Les prestations rattachées ne sont pas supprimées : elles redeviennent non classées. */
  async deleteCategory(id: string): Promise<AdminResult> {
    const { error } = await this.supabase.client
      .from('service_categories')
      .delete()
      .eq('id', id);

    if (error) return this.fail(error, 'Impossible de supprimer la catégorie.');
    return { success: true };
  }

  /**
   * Supprime définitivement une réservation. **Super administrateur seulement.**
   *
   * Passe par une RPC : la table refuse toute suppression directe, y compris
   * en cascade (cf. supabase-protect-bookings.sql). La fonction archive la
   * ligne avec son auteur avant de l'effacer — une suppression doit rester
   * explicable si un écart comptable apparaît plus tard.
   */
  async deleteBooking(id: string, reason?: string): Promise<AdminResult> {
    const { error } = await this.supabase.client.rpc('delete_booking', {
      p_id: id,
      p_reason: reason || null
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P0001' || code === 'P0002' || code === 'P0006') {
        return { success: false, error: error.message };
      }
      return this.fail(error, 'Impossible de supprimer la réservation.');
    }
    return { success: true };
  }

  // ==================== SAISIE MANUELLE ====================

  /**
   * Enregistre une prestation réalisée au comptoir, directement en « terminée ».
   *
   * C'est le pendant du cahier papier : la remise transmise est celle réellement
   * consentie sur place, pas la promotion en cours. Le montant obtenu entre
   * aussitôt dans le chiffre d'affaires.
   */
  async createManualBooking(entry: {
    service_id: string;
    client_name: string;
    booking_date: string;
    start_time: string;
    discount_percent: number;
    client_phone?: string;
    client_email?: string;
    notes?: string;
  }): Promise<AdminResult> {
    const { error } = await this.supabase.client.rpc('create_manual_booking', {
      p_service_id: entry.service_id,
      p_client_name: entry.client_name,
      p_booking_date: entry.booking_date,
      p_start_time: entry.start_time,
      p_discount_percent: entry.discount_percent,
      p_client_phone: entry.client_phone || null,
      p_client_email: entry.client_email || null,
      p_notes: entry.notes || null
    });

    if (error) {
      // Les messages levés par la fonction sont déjà rédigés pour l'écran
      const code = (error as { code?: string }).code;
      if (code === 'P0001' || code === 'P0002' || code === 'P0003') {
        return { success: false, error: error.message };
      }
      return this.fail(error, 'Impossible d\'enregistrer la prestation.');
    }
    return { success: true };
  }

  // ==================== PROMOTIONS ====================

  /** Les plus récentes d'abord, promotions passées comprises. */
  async getPromotions(): Promise<Promotion[]> {
    const { data, error } = await this.supabase.client
      .from('promotions')
      // La table de liaison est imbriquée : une requête suffit pour connaître
      // la portée de chaque promotion.
      .select('*, promotion_services(service_id)')
      .order('starts_on', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des promotions:', error);
      return [];
    }

    return (data as any[]).map(row => ({
      ...row,
      service_ids: (row.promotion_services ?? []).map((lien: any) => lien.service_id)
    })) as Promotion[];
  }

  /**
   * Crée ou modifie une promotion, portée comprise.
   *
   * Passe par une RPC : enregistrer la promotion puis ses prestations en deux
   * appels laisserait, si le second échoue, une promotion dont la portée est
   * fausse — donc des prix faux affichés aux clientes.
   *
   * @param serviceIds liste vide = la promotion s'applique à toutes les prestations
   */
  async savePromotion(
    promotion: {
      name: string;
      discount_percent: number;
      starts_on: string;
      ends_on: string;
      service_ids: string[];
    },
    id?: string
  ): Promise<AdminResult> {
    const { error } = await this.supabase.client.rpc('save_promotion', {
      p_name: promotion.name,
      p_discount_percent: promotion.discount_percent,
      p_starts_on: promotion.starts_on,
      p_ends_on: promotion.ends_on,
      p_service_ids: promotion.service_ids.length ? promotion.service_ids : null,
      p_id: id ?? null
    });

    if (error) {
      // Les messages levés par la fonction sont déjà rédigés pour l'écran
      const code = (error as { code?: string }).code;
      if (code === 'P0001' || code === 'P0002' || code === 'P0003') {
        return { success: false, error: error.message };
      }
      return this.fail(error, this.promotionError(error));
    }
    return { success: true };
  }

  /** Mise en pause ou reprise, sans toucher à la portée. */
  async setPromotionActive(id: string, active: boolean): Promise<AdminResult> {
    const { data, error } = await this.supabase.client
      .from('promotions')
      .update({ active })
      .eq('id', id)
      .select('id');

    if (error) return this.fail(error, this.promotionError(error));
    if (!data || data.length === 0) {
      return { success: false, error: 'Modification refusée. Vérifiez vos droits administrateur.' };
    }
    return { success: true };
  }

  /**
   * Supprimer une promotion ne réécrit aucun chiffre d'affaires : le prix des
   * réservations déjà prises est figé dans `price_at_booking`.
   */
  async deletePromotion(id: string): Promise<AdminResult> {
    const { error } = await this.supabase.client
      .from('promotions')
      .delete()
      .eq('id', id);

    if (error) return this.fail(error, 'Impossible de supprimer la promotion.');
    return { success: true };
  }

  /** Traduit les contraintes de la table en message lisible. */
  private promotionError(error: unknown): string {
    const message = String((error as { message?: string })?.message || '');

    if (message.includes('promotion_dates_ordered')) {
      return 'La date de fin doit être postérieure à la date de début.';
    }
    if (message.includes('discount_percent')) {
      return 'La remise doit être comprise entre 1 et 100 %.';
    }
    return 'Impossible d\'enregistrer la promotion.';
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
