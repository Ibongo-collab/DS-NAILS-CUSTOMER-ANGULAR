import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../environments/environment.development';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  /**
   * Retourne le client Supabase pour des opérations personnalisées
   */
  get client(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Subscribe aux changements en temps réel sur une table
   * @param table Nom de la table
   * @param callback Fonction appelée lors d'un changement
   * @param filter Filtre optionnel (ex: 'booking_date=eq.2024-01-15')
   */
  subscribeToTable(
    table: string,
    callback: (payload: any) => void,
    filter?: string
  ): RealtimeChannel {
    const channel = this.supabase.channel(`${table}-changes`);

    const subscription = channel.on(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: table,
        ...(filter && { filter })
      },
      callback
    );

    subscription.subscribe();
    return channel;
  }

  /**
   * Unsubscribe d'un channel temps réel
   */
  unsubscribe(channel: RealtimeChannel): void {
    this.supabase.removeChannel(channel);
  }
}
