// ============================================================
// PlansPageComponent — Smart Component CRUD de Planes
// Orquesta el servicio, la tabla genérica y el modal de form.
// ============================================================

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { Plan, TableColumn, PlanCreate } from '@core';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { PlansService } from './plans.service';

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DataTableComponent, ModalComponent],
  templateUrl: './plans.component.html',
})
export class PlansPageComponent implements OnInit {
  private readonly plansService = inject(PlansService);
  private readonly fb = inject(FormBuilder);

  // ─── Estado reactivo (Signals) ─────────────────────────────
  showFormModal   = signal(false);
  showDeleteModal = signal(false);
  editingPlan     = signal<Plan | null>(null);
  deletingPlan    = signal<Plan | null>(null);

  /** Título dinámico del modal de formulario */
  modalTitle = computed(() =>
    this.editingPlan() ? 'Editar Plan' : 'Nuevo Plan',
  );

  // ─── Datos reactivos del servicio ──────────────────────────
  plans   = this.plansService.items;
  loading = this.plansService.loading;
  error   = this.plansService.error;

  // ─── Configuración de columnas para DataTable ──────────────
  columns: TableColumn<Plan>[] = [
    { key: 'name',         label: 'Nombre',            type: 'text'     },
    { key: 'durationDays', label: 'Duración (días)',    type: 'number'   },
    { key: 'price',        label: 'Precio',             type: 'currency' },
  ];

  // ─── Formulario reactivo ───────────────────────────────────
  planForm: FormGroup = this.fb.group({
    name:         ['', [Validators.required, Validators.minLength(2)]],
    durationDays: [30, [Validators.required, Validators.min(1)]],
    price:        [0,  [Validators.required, Validators.min(0)]],
  });

  // ─── Lifecycle ─────────────────────────────────────────────

  ngOnInit(): void {
    this.plansService.getAll();
  }

  // ─── Acciones de la tabla ──────────────────────────────────

  handleRowAction(event: { action: string; row: Plan }): void {
    switch (event.action) {
      case 'edit':
        this.openEdit(event.row);
        break;
      case 'delete':
        this.openDeleteConfirm(event.row);
        break;
    }
  }

  // ─── Modal de Formulario (Crear / Editar) ──────────────────

  openNew(): void {
    this.editingPlan.set(null);
    this.planForm.reset({ name: '', durationDays: 30, price: 0 });
    this.showFormModal.set(true);
  }

  openEdit(plan: Plan): void {
    this.editingPlan.set(plan);
    this.planForm.patchValue({
      name:         plan.name,
      durationDays: plan.durationDays,
      price:        plan.price,
    });
    this.showFormModal.set(true);
  }

  closeFormModal(): void {
    this.showFormModal.set(false);
    this.editingPlan.set(null);
  }

  async savePlan(): Promise<void> {
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }

    const formValue = this.planForm.value as PlanCreate;
    const editing = this.editingPlan();

    if (editing) {
      await this.plansService.update(editing.id, formValue);
    } else {
      await this.plansService.create(formValue);
    }

    this.closeFormModal();
  }

  // ─── Modal de Confirmación de Eliminación ──────────────────

  openDeleteConfirm(plan: Plan): void {
    this.deletingPlan.set(plan);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deletingPlan.set(null);
  }

  async confirmDelete(): Promise<void> {
    const plan = this.deletingPlan();
    if (plan) {
      await this.plansService.delete(plan.id);
    }
    this.closeDeleteModal();
  }

  // ─── Helpers del template ──────────────────────────────────

  /** Verifica si un campo del formulario tiene error y fue tocado */
  hasError(field: string): boolean {
    const control = this.planForm.get(field);
    return !!(control?.invalid && control?.touched);
  }
}
