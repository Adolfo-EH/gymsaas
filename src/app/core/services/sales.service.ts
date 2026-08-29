// ============================================================
// SalesService — Servicio de ventas y transacciones
// Gestiona lógica de membresías, pases diarios y caja registradora.
// ============================================================

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { PaymentMethod, Plan, ClientCreate, CashRegister } from '../models/models';
import { toCamelCase, toSnakeCase } from '../utils/mapper.util';
import { formatDateToYYYYMMDD, parseLocalDate } from '../utils/date.util';
import { AttendanceService } from './attendance.service';

export interface MembershipSaleData {
  client: ClientCreate | { id: string };
  plan: Plan;
  startDate: string;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  amountPaidCash?: number;
  amountPaidDigital?: number;
  notes?: string;
  customPrice?: number;
  debtDueDate?: string;
}

@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly supabase = inject(SupabaseService).supabase;
  private readonly attendanceService = inject(AttendanceService);

  /**
   * Obtiene la caja abierta actual.
   * Lanza un error si no hay ninguna caja abierta.
   */
  async getActiveCashRegister(): Promise<CashRegister> {
    const { data, error } = await this.supabase
      .from('cash_registers')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error('No hay una caja abierta. Abra el turno primero.');
    }

    return toCamelCase<CashRegister>(data as Record<string, unknown>);
  }

  /**
   * Registra una venta completa de membresía:
   * 1. Inserta el cliente (si es nuevo).
   * 2. Calcula fechas y registra la membresía.
   * 3. Registra el ingreso en caja.
   */
  async registerMembershipSale(data: MembershipSaleData): Promise<void> {
    try {
      const cashRegister = await this.getActiveCashRegister();
      let clientId = (data.client as { id?: string }).id;

      // 1. Insertar cliente si es nuevo
      if (!clientId) {
        const snakeClient = toSnakeCase(data.client as Record<string, unknown>);
        const { data: newClient, error: clientError } = await this.supabase
          .from('clients')
          .insert(snakeClient)
          .select('id')
          .single();

        if (clientError) throw clientError;
        clientId = newClient.id;
      }

      if (!clientId) throw new Error('No se pudo determinar el ID del cliente');

      // 2. Insertar membresía usando el startDate seleccionado (YYYY-MM-DD)
      const startDateStr = formatDateToYYYYMMDD(data.startDate);
      const startDateObj = parseLocalDate(startDateStr);
      
      // endDate es startDate + duracion en días del plan - 1 (porque el inicio cuenta)
      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + data.plan.durationDays - 1);
      const endDateStr = formatDateToYYYYMMDD(endDateObj);

      const finalPrice = data.customPrice !== undefined ? data.customPrice : data.plan.price;
      const paymentStatus = data.amountPaid >= finalPrice ? 'pagado' : 'deuda';

      let notes = data.notes || '';
      if (data.customPrice !== undefined) {
         notes = notes ? `[PRECIO ESPECIAL] ${notes}` : '[PRECIO ESPECIAL]';
      }

      const membershipPayload = {
        client_id: clientId,
        plan_id: data.plan.id,
        start_date: startDateStr,
        end_date: endDateStr,
        total_cost: finalPrice,
        amount_paid: data.amountPaid,
        payment_method: data.paymentMethod,
        payment_status: paymentStatus,
        debt_due_date: paymentStatus === 'deuda' && data.debtDueDate ? formatDateToYYYYMMDD(data.debtDueDate) : null,
        notes: notes || null,
      };

      const { data: newMembership, error: membershipError } = await this.supabase
        .from('memberships')
        .insert(membershipPayload)
        .select('id')
        .single();

      if (membershipError) throw membershipError;

      // 3. Insertar transacción (ingreso) si pagó algo
      if (data.paymentMethod === 'dividido' && data.amountPaidCash !== undefined && data.amountPaidDigital !== undefined) {
        const txCash = {
          cash_register_id: cashRegister.id,
          type: 'IN',
          category: 'membresia',
          amount: data.amountPaidCash,
          payment_method: 'efectivo',
          description: `Venta Membresía - Plan ${data.plan.name} (Pago Dividido Efectivo)`,
          reference_id: newMembership.id,
          client_id: clientId,
        };
        const txDigital = {
          cash_register_id: cashRegister.id,
          type: 'IN',
          category: 'membresia',
          amount: data.amountPaidDigital,
          payment_method: 'yape',
          description: `Venta Membresía - Plan ${data.plan.name} (Pago Dividido Digital)`,
          reference_id: newMembership.id,
          client_id: clientId,
        };
        const { error: txError } = await this.supabase
          .from('transactions')
          .insert([txCash, txDigital]);
        if (txError) throw txError;
      } else if (data.amountPaid > 0) {
        const transactionPayload = {
          cash_register_id: cashRegister.id,
          type: 'IN',
          category: 'membresia',
          amount: data.amountPaid,
          payment_method: data.paymentMethod,
          description: `Venta Membresía - Plan ${data.plan.name}`,
          reference_id: newMembership.id,
          client_id: clientId,
        };

        const { error: txError } = await this.supabase
          .from('transactions')
          .insert(transactionPayload);

        if (txError) throw txError;
      }
    } catch (err) {
      console.error('[SalesService] registerMembershipSale error:', err);
      throw err;
    }
  }

  /**
   * Registra un ingreso por pase diario directamente en caja.
   */
  async registerDailyPass(
    amount: number,
    paymentMethod: PaymentMethod,
    amountCash?: number,
    amountDigital?: number,
    quantity: number = 1
  ): Promise<void> {
    try {
      const cashRegister = await this.getActiveCashRegister();
      const descSuffix = quantity > 1 ? ` (x${quantity})` : '';

      if (paymentMethod === 'dividido' && amountCash !== undefined && amountDigital !== undefined) {
        const txCash = {
          cash_register_id: cashRegister.id,
          type: 'IN',
          category: 'pase_diario',
          amount: amountCash,
          payment_method: 'efectivo',
          description: `Venta - Pase Diario${descSuffix} (Pago Dividido Efectivo)`,
        };
        const txDigital = {
          cash_register_id: cashRegister.id,
          type: 'IN',
          category: 'pase_diario',
          amount: amountDigital,
          payment_method: 'yape',
          description: `Venta - Pase Diario${descSuffix} (Pago Dividido Digital)`,
        };
        const { error } = await this.supabase
          .from('transactions')
          .insert([txCash, txDigital]);
        if (error) throw error;
      } else {
        const transactionPayload = {
          cash_register_id: cashRegister.id,
          type: 'IN',
          category: 'pase_diario',
          amount: amount,
          payment_method: paymentMethod,
          description: `Venta - Pase Diario${descSuffix}`,
        };

        const { error } = await this.supabase
          .from('transactions')
          .insert(transactionPayload);

        if (error) throw error;
      }
      
      // Registrar asistencia anónima para el pase diario (tantas como quantity)
      const attendances = Array.from({ length: quantity }).map(() => 
        this.attendanceService.logAccess(null, null, 'daily_pass')
      );
      await Promise.all(attendances);

    } catch (err) {
      console.error('[SalesService] registerDailyPass error:', err);
      throw err;
    }
  }

  /**
   * Saldar una deuda de membresía.
   */
  async settleDebt(
    membershipId: string,
    clientId: string,
    amountToPay: number, // Total pagado (deuda base + mora)
    paymentMethod: PaymentMethod,
    baseDebt: number,
    mora: number
  ): Promise<void> {
    try {
      const cashRegister = await this.getActiveCashRegister();

      // 1. Obtener la membresía actual
      const { data: membership, error: memGetError } = await this.supabase
        .from('memberships')
        .select('amount_paid, notes')
        .eq('id', membershipId)
        .single();

      if (memGetError) throw memGetError;

      const newAmountPaid = (membership.amount_paid || 0) + baseDebt;
      
      let newNotes = membership.notes || '';
      if (mora > 0) {
        const moraNote = `[MORA COBRADA: S/ ${mora}]`;
        newNotes = newNotes ? `${newNotes}\n${moraNote}` : moraNote;
      }

      // 2. Actualizar la membresía
      const { error: memUpdateError } = await this.supabase
        .from('memberships')
        .update({
          payment_status: 'pagado',
          amount_paid: newAmountPaid,
          notes: newNotes || null,
          debt_due_date: null
        })
        .eq('id', membershipId);

      if (memUpdateError) throw memUpdateError;

      // 3. Registrar el ingreso en la caja
      let description = 'Pago de Deuda - Membresía';
      if (mora > 0) {
        description += ` (Incluye mora de S/ ${mora})`;
      }

      const transactionPayload = {
        cash_register_id: cashRegister.id,
        type: 'IN',
        category: 'membresia',
        amount: amountToPay,
        payment_method: paymentMethod,
        description: description,
        reference_id: membershipId,
        client_id: clientId,
      };

      const { error: txError } = await this.supabase
        .from('transactions')
        .insert(transactionPayload);

      if (txError) throw txError;

    } catch (err) {
      console.error('[SalesService] settleDebt error:', err);
      throw err;
    }
  }

  /**
   * Registra una venta de productos del minimarket.
   */
  async registerProductSale(
    cart: { product: any; quantity: number }[],
    totalAmount: number,
    paymentMethod: PaymentMethod
  ): Promise<void> {
    try {
      const cashRegister = await this.getActiveCashRegister();

      // 1. Insert transaction
      const transactionPayload = {
        cash_register_id: cashRegister.id,
        type: 'IN',
        category: 'minimarket',
        amount: totalAmount,
        payment_method: paymentMethod,
        description: 'Venta Minimarket',
      };

      const { data: newTx, error: txError } = await this.supabase
        .from('transactions')
        .insert(transactionPayload)
        .select('id')
        .single();

      if (txError) throw txError;

      // 2. Insert sale items
      const saleItems = cart.map(item => ({
        transaction_id: newTx.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price
      }));

      const { error: itemsError } = await this.supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // 3. Update stock for each product
      // Ideally an RPC, but we'll do read-modify-write per product in a Promise.all
      const stockUpdates = cart.map(async (item) => {
        const { data: pData, error: pErr } = await this.supabase
          .from('products')
          .select('stock')
          .eq('id', item.product.id)
          .single();
        
        if (pErr) throw pErr;
        
        const newStock = Math.max(0, (pData.stock || 0) - item.quantity);
        
        const { error: updateErr } = await this.supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.product.id);
          
        if (updateErr) throw updateErr;
      });

      await Promise.all(stockUpdates);

    } catch (err) {
      console.error('[SalesService] registerProductSale error:', err);
      throw err;
    }
  }
}
