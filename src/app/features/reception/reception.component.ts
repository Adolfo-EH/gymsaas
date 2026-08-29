// ============================================================
// ReceptionPageComponent — Vista Mobile-First para Check-in
// Maneja lógica de ventas (Pase diario y membresías).
// ============================================================

import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { filter, distinctUntilChanged, switchMap, map, tap } from 'rxjs/operators';

import { ClientWithMembership, Plan, PaymentMethod } from '@core';
import { ClientsService } from '../clients/clients.service';
import { SalesService, MembershipSaleData } from '../../core/services/sales.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { PlansService } from '../plans/plans.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ToastService } from '../../core/services/toast.service';

/** Estado visual de la pantalla de recepción */
type ReceptionState = 'idle' | 'searching' | 'found-active' | 'found-expired' | 'found-future' | 'not-found';

@Component({
  selector: 'app-reception-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModalComponent],
  templateUrl: './reception.component.html',
})
export class ReceptionPageComponent implements OnInit, OnDestroy {
  private readonly clientsService = inject(ClientsService);
  private readonly salesService = inject(SalesService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly plansService = inject(PlansService);
  private readonly inventoryService = inject(InventoryService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  private subscription?: Subscription;

  // ─── Estado reactivo (Signals) ─────────────────────────────
  state = signal<ReceptionState>('idle');
  foundClient = signal<ClientWithMembership | null>(null);
  currentTab = signal<'access' | 'store'>('access');

  // Modales
  showMembershipModal = signal(false);
  showDailyPassModal = signal(false);
  showDebtModal = signal(false);

  // Datos auxiliares
  plans = signal<Plan[]>([]);
  loadingSales = signal(false);
  checkInTime = signal<string | null>(null);
  recentAttendances = signal<any[]>([]);

  // Store / Minimarket State
  storeProducts = this.inventoryService.products;
  cart = signal<{ product: any, quantity: number }[]>([]);
  cartTotal = computed(() => {
    return this.cart().reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  });
  
  storePaymentMethod = new FormControl('efectivo', { nonNullable: true });

  /** Control del input de DNI */
  dniControl = new FormControl('', { nonNullable: true });

  // ─── Formularios ───────────────────────────────────────────

  membershipForm: FormGroup = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.pattern(/^\d{9}$/)]],
    planId: ['', [Validators.required]],
    isCustomPrice: [false],
    customPrice: [0, [Validators.min(0)]],
    startDate: [this.getTodayString(), [Validators.required]],
    paymentMethod: ['efectivo', [Validators.required]],
    amountPaid: [0, [Validators.required, Validators.min(0)]],
    amountPaidCash: [0, [Validators.min(0)]],
    amountPaidDigital: [0, [Validators.min(0)]],
    debtDueDate: [''],
    notes: [''],
    checkInNow: [true]
  });

  dailyPassForm: FormGroup = this.fb.group({
    quantity: [1, [Validators.required, Validators.min(1)]],
    amount: [8, [Validators.required, Validators.min(1)]],
    paymentMethod: ['efectivo', [Validators.required]],
    amountPaidCash: [0, [Validators.min(0)]],
    amountPaidDigital: [0, [Validators.min(0)]],
  });

  debtForm: FormGroup = this.fb.group({
    paymentMethod: ['efectivo', [Validators.required]]
  });

  // ─── Lifecycle ─────────────────────────────────────────────

  ngOnInit(): void {
    // Cargar planes disponibles
    this.plansService.getAll().then(() => {
      this.plans.set(this.plansService.items());
    });

    this.loadRecentAttendances();
    this.inventoryService.getProducts();

    this.setupFormSync();

    // Subscripción a cambios del DNI
    this.subscription = this.dniControl.valueChanges
      .pipe(
        map((value) => value.replace(/\D/g, '')),
        tap((cleaned) => {
          if (cleaned !== this.dniControl.value) {
            this.dniControl.setValue(cleaned, { emitEvent: false });
          }
        }),
        tap((value) => {
          if (value.length !== 8) {
            this.state.set('idle');
            this.foundClient.set(null);
          }
        }),
        distinctUntilChanged(),
        filter((value) => /^\d{8}$/.test(value)),
        tap(() => this.state.set('searching')),
        switchMap((dni) => this.clientsService.getByDniWithMembership(dni)),
      )
      .subscribe(async (client) => {
        if (client) {
          this.foundClient.set(client);
          if (client.membershipStatus === 'Activo') {
            this.state.set('found-active');
            const time = this.getCurrentTime();
            this.checkInTime.set(time);
            // Log access automatically in background
            this.attendanceService.logAccess(client.id, client.membershipId)
              .then(() => this.loadRecentAttendances())
              .catch(console.error);
          } else if (client.membershipStatus === 'Por iniciar') {
            this.state.set('found-future');
            this.checkInTime.set(null);
          } else {
            this.state.set('found-expired');
            this.checkInTime.set(null);
          }
        } else {
          this.foundClient.set(null);
          this.checkInTime.set(null);
          this.state.set('not-found');
        }
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  async loadRecentAttendances(): Promise<void> {
    try {
      const data = await this.attendanceService.getRecentAttendances();
      this.recentAttendances.set(data);
    } catch (err) {
      console.error('Error cargando asistencias recientes', err);
    }
  }

  private setupFormSync(): void {
    // Helper genérico para sincronizar y limitar montos
    const bindSync = (form: FormGroup, maxFn: () => number, autoFill: boolean) => {
      const get = (f: string) => form.get(f)?.value || 0;
      const set = (f: string, v: number) => form.patchValue({ [f]: v }, { emitEvent: false });

      // Limitar el campo de pago único (si existe)
      form.get('amountPaid')?.valueChanges.subscribe(v => set('amountPaid', Math.min(v || 0, maxFn())));

      // Limitar y auto-balancear los campos divididos
      form.get('amountPaidCash')?.valueChanges.subscribe(c => {
        const max = maxFn();
        set('amountPaidCash', Math.min(c || 0, max));
        if (autoFill) set('amountPaidDigital', max - get('amountPaidCash'));
        else if (get('amountPaidCash') + get('amountPaidDigital') > max) set('amountPaidDigital', max - get('amountPaidCash'));
      });

      form.get('amountPaidDigital')?.valueChanges.subscribe(d => {
        const max = maxFn();
        set('amountPaidDigital', Math.min(d || 0, max));
        if (autoFill) set('amountPaidCash', max - get('amountPaidDigital'));
        else if (get('amountPaidCash') + get('amountPaidDigital') > max) set('amountPaidCash', max - get('amountPaidDigital'));
      });
    };

    // Aplicar a Membresía (max: precio del plan o customPrice si está activo, sin autoFill estricto)
    bindSync(this.membershipForm, () => {
      const formVal = this.membershipForm.value;
      if (formVal.isCustomPrice) return formVal.customPrice || 0;
      return this.plans().find(p => p.id === formVal.planId)?.price || 0;
    }, false);

    // Escuchar cambios en isCustomPrice y customPrice para re-validar el max
    this.membershipForm.get('isCustomPrice')?.valueChanges.subscribe(isCustom => {
      if (isCustom) {
        const plan = this.plans().find(p => p.id === this.membershipForm.value.planId);
        this.membershipForm.patchValue({ customPrice: plan ? plan.price : 0 });
      } else {
        this.membershipForm.get('amountPaid')?.updateValueAndValidity({ emitEvent: true });
        // Trigger manual balance update
        const max = this.plans().find(p => p.id === this.membershipForm.value.planId)?.price || 0;
        const currentPaid = this.membershipForm.value.amountPaid || 0;
        this.membershipForm.patchValue({ amountPaid: Math.min(currentPaid, max) });
      }
    });

    this.membershipForm.get('customPrice')?.valueChanges.subscribe(() => {
      if (this.membershipForm.value.isCustomPrice) {
        this.membershipForm.get('amountPaid')?.updateValueAndValidity({ emitEvent: true });
        const max = this.membershipForm.value.customPrice || 0;
        const currentPaid = this.membershipForm.value.amountPaid || 0;
        this.membershipForm.patchValue({ amountPaid: Math.min(currentPaid, max) });
      }
    });

    const updateDebtValidator = () => {
      const debt = this.getRemainingDebt();
      const debtControl = this.membershipForm.get('debtDueDate');
      if (debtControl) {
        if (debt > 0) {
          debtControl.setValidators([Validators.required]);
        } else {
          debtControl.clearValidators();
          debtControl.setValue('', { emitEvent: false });
        }
        debtControl.updateValueAndValidity({ emitEvent: false });
      }
    };

    this.membershipForm.get('amountPaid')?.valueChanges.subscribe(updateDebtValidator);
    this.membershipForm.get('amountPaidCash')?.valueChanges.subscribe(updateDebtValidator);
    this.membershipForm.get('amountPaidDigital')?.valueChanges.subscribe(updateDebtValidator);
    this.membershipForm.get('planId')?.valueChanges.subscribe(updateDebtValidator);
    this.membershipForm.get('isCustomPrice')?.valueChanges.subscribe(updateDebtValidator);
    this.membershipForm.get('customPrice')?.valueChanges.subscribe(updateDebtValidator);

    // Aplicar a Pase Diario (max: monto total, con autoFill estricto)
    this.dailyPassForm.get('quantity')?.valueChanges.subscribe(qty => {
      if (qty && qty >= 1) {
        this.dailyPassForm.patchValue({ amount: qty * 8 }, { emitEvent: true });
      }
    });
    bindSync(this.dailyPassForm, () => this.dailyPassForm.value.amount || 0, true);
  }

  // ─── Acciones del template ─────────────────────────────────

  // ─── Check-In ──────────────────────────────────────────────
  resetSearch(): void {
    this.dniControl.setValue('');
    this.state.set('idle');
    this.foundClient.set(null);
    this.checkInTime.set(null);
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  getTodayString(): string {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().split('T')[0];
  }

  // ─── Lógica de Tienda / Minimarket ───────────────────────

  addToCart(product: any): void {
    if (product.stock <= 0) return;
    
    this.cart.update(current => {
      const existing = current.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return current;
        return current.map(item => 
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  updateCartQuantity(productId: string, delta: number): void {
    this.cart.update(current => {
      return current.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          if (newQty > 0 && newQty <= item.product.stock) {
            return { ...item, quantity: newQty };
          }
        }
        return item;
      });
    });
  }

  removeFromCart(productId: string): void {
    this.cart.update(current => current.filter(item => item.product.id !== productId));
  }

  async submitStoreSale(): Promise<void> {
    const items = this.cart();
    if (items.length === 0) return;

    this.loadingSales.set(true);
    try {
      await this.salesService.registerProductSale(
        items,
        this.cartTotal(),
        this.storePaymentMethod.value as PaymentMethod
      );
      // Éxito
      this.cart.set([]);
      await this.inventoryService.getProducts(); // Refrescar stock
      
      // Opcional: mostrar alerta de éxito
      this.toastService.success('Venta realizada con éxito');
    } catch (err: any) {
      this.toastService.error(err.message || 'Error al procesar la venta');
    } finally {
      this.loadingSales.set(false);
    }
  }

  // ─── Lógica de Modales y Ventas ────────────────────────────

  openMembershipModal(): void {
    const client = this.foundClient();

    // Si el cliente existe, pre-llenar los nombres y deshabilitarlos temporalmente
    if (client) {
      this.membershipForm.patchValue({
        firstName: client.firstName,
        lastName: client.lastName,
        startDate: this.getTodayString(),
        checkInNow: true
      });
    } else {
      this.membershipForm.reset({
        paymentMethod: 'efectivo',
        amountPaid: 0,
        isCustomPrice: false,
        customPrice: 0,
        startDate: this.getTodayString(),
        checkInNow: true
      });
    }

    this.showMembershipModal.set(true);
  }

  closeMembershipModal(): void {
    this.showMembershipModal.set(false);
  }

  async submitMembershipSale(): Promise<void> {
    if (this.membershipForm.invalid) {
      this.membershipForm.markAllAsTouched();
      return;
    }

    this.loadingSales.set(true);
    try {
      const formVal = this.membershipForm.value;
      const client = this.foundClient();
      const plan = this.plans().find(p => p.id === formVal.planId);

      if (!plan) throw new Error('Plan inválido');

      const saleData: MembershipSaleData = {
        client: client ? { id: client.id } : {
          dni: this.dniControl.value,
          firstName: formVal.firstName,
          lastName: formVal.lastName,
          phone: formVal.phone || null
        },
        plan: plan,
        startDate: formVal.startDate,
        paymentMethod: formVal.paymentMethod as PaymentMethod,
        amountPaid: formVal.paymentMethod === 'dividido' ? ((formVal.amountPaidCash || 0) + (formVal.amountPaidDigital || 0)) : formVal.amountPaid,
        amountPaidCash: formVal.paymentMethod === 'dividido' ? formVal.amountPaidCash : undefined,
        amountPaidDigital: formVal.paymentMethod === 'dividido' ? formVal.amountPaidDigital : undefined,
        debtDueDate: this.getRemainingDebt() > 0 ? formVal.debtDueDate : undefined,
        notes: formVal.notes,
        customPrice: formVal.isCustomPrice ? formVal.customPrice : undefined
      };

      await this.salesService.registerMembershipSale(saleData);

      // Venta exitosa
      this.closeMembershipModal();

      // Forzar recarga de los datos
      const reloadedClient = await this.clientsService.getByDniWithMembership(this.dniControl.value);
      this.foundClient.set(reloadedClient);

      if (reloadedClient?.membershipStatus === 'Activo') {
        this.state.set('found-active');
        if (formVal.checkInNow) {
          const time = this.getCurrentTime();
          this.checkInTime.set(time);
          this.attendanceService.logAccess(reloadedClient.id, reloadedClient.membershipId).catch(console.error);
        } else {
          this.checkInTime.set(null);
        }
      } else if (reloadedClient?.membershipStatus === 'Por iniciar') {
        this.state.set('found-future');
        this.checkInTime.set(null);
      } else {
        this.state.set('found-expired');
        this.checkInTime.set(null);
      }

    } catch (err: any) {
      console.error('Error al procesar venta', err);
      if (err instanceof Error && err.message.includes('No hay una caja abierta')) {
        this.toastService.error('❌ ERROR: ' + err.message);
      } else {
        this.toastService.error('Error al procesar la venta');
      }
    } finally {
      this.loadingSales.set(false);
    }
  }

  // Lógica de Pase Diario
  openDailyPassModal(): void {
    this.dailyPassForm.reset({ quantity: 1, amount: 8, paymentMethod: 'efectivo' });
    this.showDailyPassModal.set(true);
  }

  closeDailyPassModal(): void {
    this.showDailyPassModal.set(false);
  }

  async submitDailyPass(): Promise<void> {
    if (this.dailyPassForm.invalid) {
      this.dailyPassForm.markAllAsTouched();
      return;
    }

    this.loadingSales.set(true);
    try {
      const formVal = this.dailyPassForm.value;
      await this.salesService.registerDailyPass(
        formVal.amount,
        formVal.paymentMethod as PaymentMethod,
        formVal.paymentMethod === 'dividido' ? formVal.amountPaidCash : undefined,
        formVal.paymentMethod === 'dividido' ? formVal.amountPaidDigital : undefined,
        formVal.quantity
      );
      this.closeDailyPassModal();
      this.resetSearch();
    } catch (err: any) {
      console.error('Error al procesar pase diario', err);
      if (err instanceof Error && err.message.includes('No hay una caja abierta')) {
        this.toastService.error('❌ ERROR: ' + err.message);
      } else {
        this.toastService.error('Error al procesar el pase diario');
      }
    } finally {
      this.loadingSales.set(false);
    }
  }

  // Lógica de Pago de Deuda
  openDebtModal(): void {
    this.debtForm.reset({ paymentMethod: 'efectivo' });
    this.showDebtModal.set(true);
  }

  closeDebtModal(): void {
    this.showDebtModal.set(false);
  }

  async submitDebtPayment(): Promise<void> {
    if (this.debtForm.invalid) {
      this.debtForm.markAllAsTouched();
      return;
    }
    const client = this.foundClient();
    if (!client || !client.membershipId || !client.membershipDebt) return;

    this.loadingSales.set(true);
    try {
      const mora = client.membershipLateFee || 0;
      const baseDebt = client.membershipDebt;
      const amountToPay = baseDebt + mora;
      const paymentMethod = this.debtForm.value.paymentMethod as PaymentMethod;

      await this.salesService.settleDebt(
        client.membershipId,
        client.id,
        amountToPay,
        paymentMethod,
        baseDebt,
        mora
      );

      this.closeDebtModal();

      // Recargar datos para que desaparezca el banner de deuda
      const reloadedClient = await this.clientsService.getByDniWithMembership(this.dniControl.value);
      this.foundClient.set(reloadedClient);

    } catch (err: any) {
      console.error('Error al saldar deuda', err);
      if (err instanceof Error && err.message.includes('No hay una caja abierta')) {
        this.toastService.error('❌ ERROR: ' + err.message);
      } else {
        this.toastService.error('Error al saldar la deuda');
      }
    } finally {
      this.loadingSales.set(false);
    }
  }

  // Helpers para el form
  onPlanChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const plan = this.plans().find(p => p.id === select.value);
    if (plan) {
      if (!this.membershipForm.value.isCustomPrice) {
        this.membershipForm.patchValue({ amountPaid: plan.price });
      } else {
        this.membershipForm.patchValue({ customPrice: plan.price });
      }
    }
  }

  getEndDate(): string {
    const formVal = this.membershipForm.value;
    const plan = this.plans().find(p => p.id === formVal.planId);
    if (!plan || !formVal.startDate) return '';

    const [year, month, day] = formVal.startDate.split('-');
    const endDateObj = new Date(Number(year), Number(month) - 1, Number(day));
    endDateObj.setDate(endDateObj.getDate() + plan.durationDays - 1);

    const yyyy = endDateObj.getFullYear();
    const mm = String(endDateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(endDateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  getRemainingDebt(): number {
    const formVal = this.membershipForm.value;
    const plan = this.plans().find(p => p.id === formVal.planId);
    if (!plan) return 0;

    const targetPrice = formVal.isCustomPrice ? (formVal.customPrice || 0) : plan.price;

    let totalPaid = 0;
    if (formVal.paymentMethod === 'dividido') {
      totalPaid = (formVal.amountPaidCash || 0) + (formVal.amountPaidDigital || 0);
    } else {
      totalPaid = formVal.amountPaid || 0;
    }

    const diff = targetPrice - totalPaid;
    return diff > 0 ? diff : 0;
  }

  isMembershipDividedValid(): boolean {
    const formVal = this.membershipForm.value;
    if (formVal.paymentMethod !== 'dividido') return true;
    const plan = this.plans().find(p => p.id === formVal.planId);
    if (!plan) return false;
    const targetPrice = formVal.isCustomPrice ? (formVal.customPrice || 0) : plan.price;
    const total = (formVal.amountPaidCash || 0) + (formVal.amountPaidDigital || 0);
    return total <= targetPrice;
  }

  isDailyPassDividedValid(): boolean {
    const formVal = this.dailyPassForm.value;
    if (formVal.paymentMethod !== 'dividido') return true;
    const total = (formVal.amountPaidCash || 0) + (formVal.amountPaidDigital || 0);
    return total === formVal.amount;
  }

  hasMembershipError(field: string): boolean {
    const control = this.membershipForm.get(field);
    return !!(control?.invalid && control?.touched);
  }

  hasDailyPassError(field: string): boolean {
    const control = this.dailyPassForm.get(field);
    return !!(control?.invalid && control?.touched);
  }
}
