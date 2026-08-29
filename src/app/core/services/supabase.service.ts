// ============================================================
// Supabase Service — Cliente Singleton
// Inicializa y expone el cliente de Supabase para toda la app.
// ============================================================

import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '@environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor() {
    if (!environment.supabaseUrl || !environment.supabaseKey) {
      console.warn(
        '[SupabaseService] ⚠️ SUPABASE_URL o SUPABASE_KEY están vacíos. ' +
        'Configura src/environments/environment.ts con tus credenciales.',
      );
    }

    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  /**
   * Devuelve la instancia del cliente de Supabase.
   * Todos los servicios de features deben usar este getter
   * en lugar de crear su propia instancia.
   */
  get supabase(): SupabaseClient {
    return this.client;
  }
}
