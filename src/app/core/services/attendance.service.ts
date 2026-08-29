// ============================================================
// AttendanceService — Servicio para registrar asistencias
// ============================================================

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly supabase = inject(SupabaseService).supabase;
  private readonly tableName = 'attendances';

  /**
   * Registra un nuevo acceso en la base de datos.
   * La base de datos asignará el `check_in_time` por defecto (now()).
   */
  async logAccess(clientId: string | null, membershipId: string | null, accessType: string = 'membership'): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .insert({
          client_id: clientId || null,
          membership_id: membershipId || null,
          access_type: accessType
        });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[AttendanceService] Error al registrar acceso:', err);
      return false;
    }
  }

  /**
   * Obtiene los últimos accesos registrados para auditoría / pruebas.
   */
  async getRecentAttendances(limit = 5): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('id, client_id, membership_id, check_in_time, clients(first_name, last_name, dni)')
        .order('check_in_time', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data ?? [];
    } catch (err) {
      console.error('[AttendanceService] Error al obtener accesos:', err);
      return [];
    }
  }
}
