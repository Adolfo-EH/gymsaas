import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface TopProduct {
  id: string;
  name: string;
  totalQuantity: number;
}

export interface Debtor {
  id: string;
  firstName: string;
  lastName: string;
  debt: number;
  lateFee: number;
  dueDate: string | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SupabaseService).supabase;

  private getTodayStartString(): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Convert to UTC string since Supabase stores created_at in UTC
    return today.toISOString();
  }

  private getTodayISOString(): string {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().split('T')[0];
  }

  /** 1. Ingresos de Hoy */
  async getTodayRevenue(): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'IN')
        .gte('created_at', this.getTodayStartString());

      if (error) throw error;
      return data.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    } catch (err) {
      console.error('[DashboardService] getTodayRevenue error:', err);
      return 0;
    }
  }

  /** 2. Clientes Activos */
  async getActiveMembersCount(): Promise<number> {
    try {
      const today = this.getTodayISOString();
      const { count, error } = await this.supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .lte('start_date', today)
        .gte('end_date', today);

      if (error) throw error;
      return count || 0;
    } catch (err) {
      console.error('[DashboardService] getActiveMembersCount error:', err);
      return 0;
    }
  }

  /** 3a. Conteo de Morosos */
  async getDebtorsCount(): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'deuda');

      if (error) throw error;
      return count || 0;
    } catch (err) {
      console.error('[DashboardService] getDebtorsCount error:', err);
      return 0;
    }
  }

  /** 3b. Lista de Morosos */
  async getDebtorsList(limit: number = 5): Promise<Debtor[]> {
    try {
      // Obtenemos las membresías en deuda junto con los datos del cliente
      const { data, error } = await this.supabase
        .from('memberships')
        .select(`
          id,
          total_cost,
          amount_paid,
          debt_due_date,
          clients (id, first_name, last_name)
        `)
        .eq('payment_status', 'deuda')
        .order('debt_due_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const today = this.getTodayISOString();
      return data.map((m: any) => {
        const client = m.clients;
        const debt = Math.max(0, m.total_cost - (m.amount_paid || 0));
        let lateFee = 0;

        if (m.debt_due_date && m.debt_due_date < today) {
          const due = new Date(m.debt_due_date + 'T00:00:00');
          const now = new Date(today + 'T00:00:00');
          const diffTime = Math.abs(now.getTime() - due.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          lateFee = diffDays * 1; // S/ 1 por día
        }

        return {
          id: client?.id || '',
          firstName: client?.first_name || 'Desconocido',
          lastName: client?.last_name || '',
          debt,
          lateFee,
          dueDate: m.debt_due_date
        };
      });
    } catch (err) {
      console.error('[DashboardService] getDebtorsList error:', err);
      return [];
    }
  }

  /** 4. Top Productos Vendidos */
  async getTopProducts(limit: number = 5): Promise<TopProduct[]> {
    try {
      const { data, error } = await this.supabase
        .from('sale_items')
        .select(`
          quantity,
          product_id,
          products (name)
        `);

      if (error) throw error;

      // Agrupamos en memoria
      const productMap = new Map<string, TopProduct>();

      data.forEach((item: any) => {
        const pId = item.product_id;
        if (!pId) return;

        const current = productMap.get(pId);
        if (current) {
          current.totalQuantity += item.quantity;
        } else {
          productMap.set(pId, {
            id: pId,
            name: item.products?.name || 'Desconocido',
            totalQuantity: item.quantity
          });
        }
      });

      // Convertimos a array, ordenamos por cantidad descendente y tomamos el límite
      const sorted = Array.from(productMap.values())
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, limit);

      return sorted;
    } catch (err) {
      console.error('[DashboardService] getTopProducts error:', err);
      return [];
    }
  }
}
