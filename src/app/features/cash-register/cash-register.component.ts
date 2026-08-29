import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CashRegisterService, TransactionWithClient } from './cash-register.service';
import { CashRegister, TableColumn } from '../../core/models/models';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { SupabaseService } from '../../core/services/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-cash-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DataTableComponent, ModalComponent],
  templateUrl: './cash-register.component.html',
})
export class CashRegisterPageComponent implements OnInit, OnDestroy {
  private readonly cashRegisterService = inject(CashRegisterService);
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).supabase;
  
  private channel?: RealtimeChannel;

  // States
  activeRegister = signal<CashRegister | null>(null);
  transactions = signal<TransactionWithClient[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  // Computed
  isRegisterOpen = computed(() => !!this.activeRegister());
  
  cashIncome = computed(() => {
    return this.transactions()
      .filter(t => t.paymentMethod === 'efectivo' && t.type === 'IN')
      .reduce((sum, t) => sum + t.amount, 0);
  });
  
  cashExpense = computed(() => {
    return this.transactions()
      .filter(t => t.paymentMethod === 'efectivo' && t.type === 'OUT')
      .reduce((sum, t) => sum + t.amount, 0);
  });
  
  digitalIncome = computed(() => {
    return this.transactions()
      .filter(t => (t.paymentMethod === 'yape' || t.paymentMethod === 'plin') && t.type === 'IN')
      .reduce((sum, t) => sum + t.amount, 0);
  });
  
  shiftTotal = computed(() => {
    const reg = this.activeRegister();
    if (!reg) return 0;
    return reg.openingBalance + this.cashIncome() - this.cashExpense() + this.digitalIncome();
  });
  
  expectedTotal = computed(() => {
    const reg = this.activeRegister();
    if (!reg) return 0;
    return reg.openingBalance + this.cashIncome() - this.cashExpense();
  });

  // Forms
  openForm = this.fb.group({
    openingBalance: [0, [Validators.required, Validators.min(0)]]
  });

  closeForm = this.fb.group({
    actualBalance: [0, [Validators.required, Validators.min(0)]]
  });

  showCloseModal = signal(false);

  // Data Table Columns
  columns: TableColumn<TransactionWithClient>[] = [
    { key: 'createdAt', label: 'Fecha/Hora', type: 'date', transform: (v) => new Date(v as string).toLocaleString('es-PE') },
    { key: 'type', label: 'Tipo', type: 'badge', badgeClasses: { 'IN': 'bg-emerald-100 text-emerald-800', 'OUT': 'bg-red-100 text-red-800' } },
    { key: 'category', label: 'Categoría', type: 'text', transform: (v) => String(v).replace('_', ' ').toUpperCase() },
    { key: 'amount', label: 'Monto', type: 'currency' },
    { key: 'paymentMethod', label: 'Método', type: 'text', transform: (v) => String(v).toUpperCase() },
    { key: 'description', label: 'Descripción', type: 'text' },
    { key: 'clients', label: 'Cliente', type: 'text', transform: (_, row) => row.clients ? `${row.clients.firstName} ${row.clients.lastName}` : '-' },
  ];

  ngOnInit() {
    this.loadRegisterState();
  }

  ngOnDestroy() {
    this.channel?.unsubscribe();
  }

  async loadRegisterState() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const reg = await this.cashRegisterService.getOpenRegister();
      this.activeRegister.set(reg);
      if (reg) {
        const txs = await this.cashRegisterService.getRegisterTransactions(reg.id);
        this.transactions.set(txs);
        this.setupRealtime(reg.id);
      } else {
        this.transactions.set([]);
        this.channel?.unsubscribe();
        this.channel = undefined;
      }
    } catch (err: any) {
      console.error(err);
      this.error.set('Error al cargar el estado de la caja registradora.');
    } finally {
      this.loading.set(false);
    }
  }

  async openShift() {
    if (this.openForm.invalid) {
      this.openForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    try {
      const balance = this.openForm.value.openingBalance || 0;
      await this.cashRegisterService.openRegister(balance);
      await this.loadRegisterState();
      this.openForm.reset({ openingBalance: 0 });
    } catch (err: any) {
      console.error(err);
      this.error.set('Error al abrir el turno de caja.');
      this.loading.set(false);
    }
  }

  promptCloseShift() {
    this.closeForm.reset({ actualBalance: '' as any });
    this.showCloseModal.set(true);
  }

  async confirmCloseShift() {
    if (this.closeForm.invalid) {
      this.closeForm.markAllAsTouched();
      return;
    }
    const reg = this.activeRegister();
    if (!reg) return;

    this.loading.set(true);
    try {
      const actual = this.closeForm.value.actualBalance || 0;
      await this.cashRegisterService.closeRegister(reg.id, reg.openingBalance, actual);
      this.showCloseModal.set(false);
      
      this.channel?.unsubscribe();
      this.channel = undefined;
      
      await this.loadRegisterState();
    } catch (err: any) {
      console.error(err);
      this.error.set('Error al cerrar el turno de caja.');
      this.loading.set(false);
    }
  }

  private setupRealtime(registerId: string) {
    if (this.channel) return;

    this.channel = this.supabase
      .channel(`transactions_register_${registerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions', filter: `cash_register_id=eq.${registerId}` },
        async () => {
          try {
            const txs = await this.cashRegisterService.getRegisterTransactions(registerId);
            this.transactions.set(txs);
          } catch (error) {
            console.error('Error auto-updating transactions', error);
          }
        }
      )
      .subscribe();
  }
}
