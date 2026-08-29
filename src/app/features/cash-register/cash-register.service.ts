import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { CashRegister, Transaction } from '../../core/models/models';
import { toCamelCase, toSnakeCase } from '../../core/utils/mapper.util';

export interface TransactionWithClient extends Transaction {
  clients?: {
    firstName: string;
    lastName: string;
    dni: string;
  };
}

@Injectable({ providedIn: 'root' })
export class CashRegisterService {
  private readonly supabase = inject(SupabaseService).supabase;

  /**
   * Obtiene la última caja abierta.
   * Retorna null si no hay ninguna.
   */
  async getOpenRegister(): Promise<CashRegister | null> {
    const { data, error } = await this.supabase
      .from('cash_registers')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return toCamelCase<CashRegister>(data as Record<string, unknown>);
  }

  /**
   * Abre un nuevo turno de caja.
   */
  async openRegister(openingBalance: number): Promise<CashRegister> {
    const { data, error } = await this.supabase
      .from('cash_registers')
      .insert({
        opening_balance: openingBalance,
        expected_cash_balance: openingBalance,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;
    return toCamelCase<CashRegister>(data as Record<string, unknown>);
  }

  /**
   * Obtiene todas las transacciones vinculadas a una caja, incluyendo info del cliente.
   */
  async getRegisterTransactions(registerId: string): Promise<TransactionWithClient[]> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select(`
        *,
        clients (
          first_name,
          last_name,
          dni
        )
      `)
      .eq('cash_register_id', registerId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ? data.map(d => toCamelCase<TransactionWithClient>(d as Record<string, unknown>)) : [];
  }

  /**
   * Cierra el turno de caja.
   * Calcula el efectivo esperado real basado en las transacciones en efectivo.
   */
  async closeRegister(registerId: string, openingBalance: number, actualCashBalance: number): Promise<CashRegister> {
    // 1. Obtener total ingresado y retirado en efectivo
    const { data: txData, error: txError } = await this.supabase
      .from('transactions')
      .select('amount, type')
      .eq('cash_register_id', registerId)
      .eq('payment_method', 'efectivo');

    if (txError) throw txError;

    // Calcular suma
    let cashIncome = 0;
    if (txData) {
      txData.forEach(tx => {
        if (tx.type === 'IN') cashIncome += tx.amount;
        else if (tx.type === 'OUT') cashIncome -= tx.amount;
      });
    }

    const expectedCashBalance = openingBalance + cashIncome;

    // 2. Cerrar caja
    const { data, error } = await this.supabase
      .from('cash_registers')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        expected_cash_balance: expectedCashBalance,
        actual_cash_balance: actualCashBalance
      })
      .eq('id', registerId)
      .select()
      .single();

    if (error) throw error;
    return toCamelCase<CashRegister>(data as Record<string, unknown>);
  }
}
