// ============================================================
// ClientsService — Servicio de datos para Clientes
// Extiende BaseCrudService apuntando a la tabla 'clients'.
// Hereda: update, delete + Signals.
// Override: getAllWithMembership() para join con membresías.
// Añade: getByDni() para búsqueda desde Recepción.
// ============================================================

import { Injectable } from '@angular/core';
import { BaseCrudService } from '@core/services/base-crud.service';
import { Client, ClientWithMembership } from '@core';
import { toCamelCase, mapArrayToCamelCase } from '@core/utils/mapper.util';
import { parseLocalDate } from '@core/utils/date.util';

@Injectable({ providedIn: 'root' })
export class ClientsService extends BaseCrudService<Client> {
  constructor() {
    super('clients', 'created_at');
  }

  /**
   * Carga todos los clientes con su membresía más reciente.
   * Hace JOIN con la tabla memberships para obtener end_date y payment_status.
   * Calcula el estado (Activo/Vencido) en frontend comparando end_date con hoy.
   * Retorna ClientWithMembership[] pero almacena en items como Client[] (supertype).
   */
  async getAllWithMembership(): Promise<ClientWithMembership[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*, memberships(id, start_date, end_date, total_cost, amount_paid, payment_status, debt_due_date, plans(name))')
        .order(this.defaultOrderBy, { ascending: false });

      if (error) {
        throw error;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const clients: ClientWithMembership[] = (data ?? []).map((raw: Record<string, unknown>) => {
        // Mapear el cliente base a camelCase
        const base = toCamelCase<Client & { memberships?: Record<string, unknown>[] }>(raw);

        // Obtener la membresía más reciente (Supabase retorna array)
        const memberships = base.memberships ?? [];
        const latestMembership = memberships.length > 0
          ? memberships.reduce((latest, m) => {
            const latestEnd = latest['endDate'] as string | undefined;
            const currentEnd = m['endDate'] as string | undefined;
            if (!latestEnd) return m;
            if (!currentEnd) return latest;
            return currentEnd > latestEnd ? m : latest;
          })
          : null;

        const endDate = latestMembership
          ? (latestMembership['endDate'] as string | null)
          : null;

        const membershipId = latestMembership
          ? (latestMembership['id'] as string | null)
          : null;

        const paymentStatus = latestMembership
          ? (latestMembership['paymentStatus'] as string | null)
          : null;

        const planObj = latestMembership
          ? (latestMembership['plans'] as Record<string, unknown> | null)
          : null;
        const planName = planObj ? (planObj['name'] as string | null) : null;

        const startDate = latestMembership
          ? (latestMembership['startDate'] as string | null)
          : null;

        // Calcular estado
        let membershipStatus: 'Activo' | 'Vencido' | 'Por iniciar' | 'Sin membresía' = 'Sin membresía';
        if (endDate && startDate) {
          const endDateObj = parseLocalDate(endDate);
          const startDateObj = parseLocalDate(startDate);
          if (today < startDateObj) {
            membershipStatus = 'Por iniciar';
          } else if (today > endDateObj) {
            membershipStatus = 'Vencido';
          } else {
            membershipStatus = 'Activo';
          }
        } else if (endDate) {
          const endDateObj = parseLocalDate(endDate);
          membershipStatus = endDateObj >= today ? 'Activo' : 'Vencido';
        }

        const totalCost = latestMembership ? Number(latestMembership['totalCost']) || 0 : 0;
        const amountPaid = latestMembership ? Number(latestMembership['amountPaid']) || 0 : 0;
        const debtDueDate = latestMembership ? (latestMembership['debtDueDate'] as string | null) : null;
        
        let membershipDebt = 0;
        let membershipLateFee = 0;
        
        if (paymentStatus === 'deuda' && totalCost > amountPaid) {
          membershipDebt = totalCost - amountPaid;
          if (debtDueDate) {
            const dueObj = parseLocalDate(debtDueDate);
            if (today > dueObj) {
              const diffTime = Math.abs(today.getTime() - dueObj.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              membershipLateFee = diffDays * 1; // S/ 1 por día
            }
          }
        }

        return {
          id: base.id,
          dni: base.dni,
          firstName: base.firstName,
          lastName: base.lastName,
          phone: base.phone,
          createdAt: base.createdAt,
          membershipId,
          membershipStartDate: startDate,
          membershipEndDate: endDate,
          membershipPlanName: planName,
          membershipPaymentStatus: paymentStatus as ClientWithMembership['membershipPaymentStatus'],
          membershipStatus,
          membershipDebt: membershipDebt > 0 ? membershipDebt : undefined,
          membershipLateFee: membershipLateFee > 0 ? membershipLateFee : undefined,
          membershipDebtDueDate: debtDueDate
        };
      });

      return clients;
    } catch (err) {
      console.error(`[ClientsService] getAllWithMembership error:`, err);
      return [];
    }
  }

  /**
   * Carga un cliente por su ID con su membresía más reciente.
   * Reutiliza la lógica de parseo de getAllWithMembership para un solo cliente.
   */
  async getByIdWithMembership(id: string): Promise<ClientWithMembership | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*, memberships(id, start_date, end_date, total_cost, amount_paid, payment_status, debt_due_date, plans(name))')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const raw = data as Record<string, unknown>;
      const base = toCamelCase<Client & { memberships?: Record<string, unknown>[] }>(raw);
      const memberships = base.memberships ?? [];
      const latestMembership = memberships.length > 0
        ? memberships.reduce((latest, m) => {
          const latestEnd = latest['endDate'] as string | undefined;
          const currentEnd = m['endDate'] as string | undefined;
          if (!latestEnd) return m;
          if (!currentEnd) return latest;
          return currentEnd > latestEnd ? m : latest;
        })
        : null;

      const endDate = latestMembership ? (latestMembership['endDate'] as string | null) : null;
      const membershipId = latestMembership ? (latestMembership['id'] as string | null) : null;
      const paymentStatus = latestMembership ? (latestMembership['paymentStatus'] as string | null) : null;
      const planObj = latestMembership ? (latestMembership['plans'] as Record<string, unknown> | null) : null;
      const planName = planObj ? (planObj['name'] as string | null) : null;
      const startDate = latestMembership ? (latestMembership['startDate'] as string | null) : null;

      let membershipStatus: 'Activo' | 'Vencido' | 'Por iniciar' | 'Sin membresía' = 'Sin membresía';
      if (endDate && startDate) {
        const endDateObj = parseLocalDate(endDate);
        const startDateObj = parseLocalDate(startDate);
        if (today < startDateObj) {
          membershipStatus = 'Por iniciar';
        } else if (today > endDateObj) {
          membershipStatus = 'Vencido';
        } else {
          membershipStatus = 'Activo';
        }
      } else if (endDate) {
        const endDateObj = parseLocalDate(endDate);
        membershipStatus = endDateObj >= today ? 'Activo' : 'Vencido';
      }

      const totalCost = latestMembership ? Number(latestMembership['totalCost']) || 0 : 0;
      const amountPaid = latestMembership ? Number(latestMembership['amountPaid']) || 0 : 0;
      const debtDueDate = latestMembership ? (latestMembership['debtDueDate'] as string | null) : null;
      
      let membershipDebt = 0;
      let membershipLateFee = 0;
      
      if (paymentStatus === 'deuda' && totalCost > amountPaid) {
        membershipDebt = totalCost - amountPaid;
        if (debtDueDate) {
          const dueObj = parseLocalDate(debtDueDate);
          if (today > dueObj) {
            const diffTime = Math.abs(today.getTime() - dueObj.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            membershipLateFee = diffDays * 1;
          }
        }
      }

      return {
        id: base.id,
        dni: base.dni,
        firstName: base.firstName,
        lastName: base.lastName,
        phone: base.phone,
        createdAt: base.createdAt,
        membershipId,
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        membershipPlanName: planName,
        membershipPaymentStatus: paymentStatus as ClientWithMembership['membershipPaymentStatus'],
        membershipStatus,
        membershipDebt: membershipDebt > 0 ? membershipDebt : undefined,
        membershipLateFee: membershipLateFee > 0 ? membershipLateFee : undefined,
        membershipDebtDueDate: debtDueDate
      };
    } catch (err) {
      console.error(`[ClientsService] getByIdWithMembership error:`, err);
      return null;
    }
  }

  /**
   * Busca un cliente por su DNI (exacto, 8 dígitos).
   * Retorna el cliente encontrado o null si no existe.
   * No altera el estado de `items`.
   */
  async getByDni(dni: string): Promise<Client | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('dni', dni)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      return toCamelCase<Client>(data as unknown as Record<string, unknown>);
    } catch (err) {
      console.error(`[ClientsService] getByDni error:`, err);
      return null;
    }
  }

  /**
   * Busca un cliente por su DNI (exacto, 8 dígitos) e incluye su membresía más reciente.
   * Calcula el estado de membresía en tiempo real.
   */
  async getByDniWithMembership(dni: string): Promise<ClientWithMembership | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*, memberships(id, start_date, end_date, total_cost, amount_paid, payment_status, debt_due_date, plans(name))')
        .eq('dni', dni)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const base = toCamelCase<Client & { memberships?: Record<string, unknown>[] }>(data as Record<string, unknown>);

      const memberships = base.memberships ?? [];
      const latestMembership = memberships.length > 0
        ? memberships.reduce((latest, m) => {
          const latestEnd = latest['endDate'] as string | undefined;
          const currentEnd = m['endDate'] as string | undefined;
          if (!latestEnd) return m;
          if (!currentEnd) return latest;
          return currentEnd > latestEnd ? m : latest;
        })
        : null;

      const endDate = latestMembership ? (latestMembership['endDate'] as string | null) : null;
      const membershipId = latestMembership ? (latestMembership['id'] as string | null) : null;
      const paymentStatus = latestMembership ? (latestMembership['paymentStatus'] as string | null) : null;

      const planObj = latestMembership ? (latestMembership['plans'] as Record<string, unknown> | null) : null;
      const planName = planObj ? (planObj['name'] as string | null) : null;

      const startDate = latestMembership ? (latestMembership['startDate'] as string | null) : null;

      let membershipStatus: 'Activo' | 'Vencido' | 'Por iniciar' | 'Sin membresía' = 'Sin membresía';
      if (endDate && startDate) {
        const endDateObj = parseLocalDate(endDate);
        const startDateObj = parseLocalDate(startDate);
        if (today < startDateObj) {
          membershipStatus = 'Por iniciar';
        } else if (today > endDateObj) {
          membershipStatus = 'Vencido';
        } else {
          membershipStatus = 'Activo';
        }
      } else if (endDate) {
        const endDateObj = parseLocalDate(endDate);
        membershipStatus = endDateObj >= today ? 'Activo' : 'Vencido';
      }

      const totalCost = latestMembership ? Number(latestMembership['totalCost']) || 0 : 0;
      const amountPaid = latestMembership ? Number(latestMembership['amountPaid']) || 0 : 0;
      const debtDueDate = latestMembership ? (latestMembership['debtDueDate'] as string | null) : null;
      
      let membershipDebt = 0;
      let membershipLateFee = 0;
      
      if (paymentStatus === 'deuda' && totalCost > amountPaid) {
        membershipDebt = totalCost - amountPaid;
        if (debtDueDate) {
          const dueObj = parseLocalDate(debtDueDate);
          if (today > dueObj) {
            const diffTime = Math.abs(today.getTime() - dueObj.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            membershipLateFee = diffDays * 1; // S/ 1 por día
          }
        }
      }

      return {
        id: base.id,
        dni: base.dni,
        firstName: base.firstName,
        lastName: base.lastName,
        phone: base.phone,
        createdAt: base.createdAt,
        membershipId,
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        membershipPlanName: planName,
        membershipPaymentStatus: paymentStatus as ClientWithMembership['membershipPaymentStatus'],
        membershipStatus,
        membershipDebt: membershipDebt > 0 ? membershipDebt : undefined,
        membershipLateFee: membershipLateFee > 0 ? membershipLateFee : undefined,
        membershipDebtDueDate: debtDueDate
      };
    } catch (err) {
      console.error(`[ClientsService] getByDniWithMembership error:`, err);
      return null;
    }
  }
  /**
   * Obtiene el historial de pagos de un cliente.
   */
  async getClientTransactions(clientId: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ? mapArrayToCamelCase(data as any[]) : [];
    } catch (err) {
      console.error(`[ClientsService] getClientTransactions error:`, err);
      return [];
    }
  }

  /**
   * Obtiene el historial de asistencias de un cliente.
   */
  async getClientAttendances(clientId: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('attendances')
        .select('*, memberships(plans(name))')
        .eq('client_id', clientId)
        .order('check_in_time', { ascending: false });

      if (error) throw error;
      return data ? mapArrayToCamelCase(data as any[]) : [];
    } catch (err) {
      console.error(`[ClientsService] getClientAttendances error:`, err);
      return [];
    }
  }
}
