// ============================================================
// ClientsPageComponent — Directorio de Clientes (Solo Lectura)
// Tabla con membresía más reciente. Solo permite editar datos
// básicos. La creación de clientes ocurre en el flujo de ventas.
// ============================================================

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { Client, ClientWithMembership, TableColumn, TableActionConfig } from '@core';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ClientsService } from './clients.service';

@Component({
  selector: 'app-clients-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DataTableComponent, ModalComponent],
  templateUrl: './clients.component.html',
})
export class ClientsPageComponent implements OnInit {
  private readonly clientsService = inject(ClientsService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  // ─── Estado reactivo (Signals) ─────────────────────────────
  showEditModal   = signal(false);
  editingClient   = signal<ClientWithMembership | null>(null);
  searchQuery     = signal('');

  // ─── Datos reactivos ──────────────────────────────────────
  clients = signal<ClientWithMembership[]>([]);
  filteredClients = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const all = this.clients();
    if (!query) return all;
    return all.filter(c => 
      c.firstName.toLowerCase().includes(query) || 
      c.lastName.toLowerCase().includes(query) || 
      c.dni.includes(query)
    );
  });
  loading = this.clientsService.loading;
  error   = this.clientsService.error;

  // ─── Configuración de columnas para DataTable ──────────────
  columns: TableColumn<ClientWithMembership>[] = [
    { key: 'dni',       label: 'DNI',        type: 'text' },
    {
      key: 'firstName',
      label: 'Cliente',
      type: 'text',
      transform: (_value: unknown, row: ClientWithMembership) =>
        `${row.firstName} ${row.lastName}`,
    },
    {
      key: 'phone',
      label: 'Teléfono',
      type: 'text',
      transform: (value: unknown) => value ? String(value) : '—',
    },
    {
      key: 'membershipPlanName',
      label: 'Plan',
      type: 'text',
      transform: (value: unknown) => value ? String(value) : '—',
    },
    {
      key: 'membershipEndDate',
      label: 'Vencimiento',
      type: 'text',
      transform: (value: unknown) => {
        if (!value) return 'Sin membresía';
        return new Date(String(value) + 'T00:00:00').toLocaleDateString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      },
    },
    {
      key: 'membershipPaymentStatus',
      label: 'Pago',
      type: 'badge',
      transform: (value: unknown) => {
        if (!value) return '—';
        return value === 'pagado' ? 'Pagado' : 'Deuda';
      },
      badgeClasses: {
        'Pagado': 'bg-emerald-100 text-emerald-700',
        'Deuda':  'bg-amber-100 text-amber-700 font-bold',
        '—':      'bg-slate-100 text-slate-500',
      },
    },
    {
      key: 'membershipStatus',
      label: 'Estado',
      type: 'badge',
      badgeClasses: {
        'Activo':         'bg-emerald-100 text-emerald-700',
        'Vencido':        'bg-red-100 text-red-700',
        'Sin membresía':  'bg-gray-100 text-gray-500',
      },
    },
  ];

  // Acción de editar y ver perfil
  tableActions: TableActionConfig[] = [
    { action: 'view', label: 'Ver Perfil', icon: 'view', color: 'text-indigo-600 hover:text-indigo-800' },
    { action: 'edit', label: 'Editar', icon: 'edit', color: 'text-blue-600 hover:text-blue-800' },
  ];

  // ─── Formulario reactivo (solo datos básicos editables) ────
  clientForm: FormGroup = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName:  ['', [Validators.required, Validators.minLength(2)]],
    phone:     [''],
  });

  // ─── Lifecycle ─────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    await this.loadClients();
  }

  // ─── Carga de datos ───────────────────────────────────────

  private async loadClients(): Promise<void> {
    const data = await this.clientsService.getAllWithMembership();
    this.clients.set(data);
  }

  // ─── Acciones de la tabla ──────────────────────────────────

  handleRowAction(event: { action: string; row: ClientWithMembership }): void {
    if (event.action === 'edit') {
      this.openEdit(event.row);
    } else if (event.action === 'view') {
      this.router.navigate(['/clients', event.row.id]);
    }
  }

  // ─── Modal de Edición ─────────────────────────────────────

  openEdit(client: ClientWithMembership): void {
    this.editingClient.set(client);
    this.clientForm.patchValue({
      firstName: client.firstName,
      lastName:  client.lastName,
      phone:     client.phone ?? '',
    });
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editingClient.set(null);
  }

  async saveClient(): Promise<void> {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    const editing = this.editingClient();
    if (!editing) return;

    const formValue = this.clientForm.value;
    // Normalizar phone vacío a null
    if (!formValue.phone) {
      formValue.phone = null;
    }

    await this.clientsService.update(editing.id, formValue);
    await this.loadClients(); // Recargar con membresías
    this.closeEditModal();
  }


  // ─── Helpers del template ──────────────────────────────────

  /** Verifica si un campo del formulario tiene error y fue tocado */
  hasError(field: string): boolean {
    const control = this.clientForm.get(field);
    return !!(control?.invalid && control?.touched);
  }
}
