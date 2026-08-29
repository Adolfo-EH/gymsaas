import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientWithMembership } from '@core';
import { ClientsService } from './clients.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SalesService } from '../../core/services/sales.service';
import { PaymentMethod } from '../../core/models/models';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-client-profile-page',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, ModalComponent],
  templateUrl: './client-profile.component.html', // explicit template path
})
export class ClientProfilePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientsService = inject(ClientsService);
  private readonly fb = inject(FormBuilder);
  private readonly salesService = inject(SalesService);
  private readonly toastService = inject(ToastService);

  client = signal<ClientWithMembership | null>(null);
  transactions = signal<any[]>([]);
  attendances = signal<any[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  showDebtModal = signal(false);
  loadingSales = signal(false);
  
  debtForm: FormGroup = this.fb.group({
    paymentMethod: ['efectivo', [Validators.required]]
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('No se proporcionó un ID de cliente válido.');
      this.loading.set(false);
      return;
    }

    try {
      const [data, trans, atts] = await Promise.all([
        this.clientsService.getByIdWithMembership(id),
        this.clientsService.getClientTransactions(id),
        this.clientsService.getClientAttendances(id)
      ]);

      if (data) {
        this.client.set(data);
        this.transactions.set(trans);
        this.attendances.set(atts);
      } else {
        this.error.set('No se encontró al cliente solicitado.');
      }
    } catch (err) {
      this.error.set('Error al cargar la información del cliente.');
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/clients']);
  }

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
    const currentClient = this.client();
    if (!currentClient || !currentClient.membershipId || !currentClient.membershipDebt) return;

    this.loadingSales.set(true);
    try {
      const mora = currentClient.membershipLateFee || 0;
      const baseDebt = currentClient.membershipDebt;
      const amountToPay = baseDebt + mora;
      const paymentMethod = this.debtForm.value.paymentMethod as PaymentMethod;

      await this.salesService.settleDebt(
        currentClient.membershipId,
        currentClient.id,
        amountToPay,
        paymentMethod,
        baseDebt,
        mora
      );

      this.closeDebtModal();

      // Recargar datos
      const [data, trans, atts] = await Promise.all([
        this.clientsService.getByIdWithMembership(currentClient.id),
        this.clientsService.getClientTransactions(currentClient.id),
        this.clientsService.getClientAttendances(currentClient.id)
      ]);

      if (data) {
        this.client.set(data);
        this.transactions.set(trans);
        this.attendances.set(atts);
      }
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
}
