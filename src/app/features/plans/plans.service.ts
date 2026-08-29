// ============================================================
// PlansService — Servicio de datos para Planes de Membresía
// Extiende BaseCrudService apuntando a la tabla 'plans'.
// Hereda: getAll, getById, create, update, delete + Signals.
// ============================================================

import { Injectable } from '@angular/core';
import { BaseCrudService } from '@core/services/base-crud.service';
import { Plan } from '@core';

@Injectable({ providedIn: 'root' })
export class PlansService extends BaseCrudService<Plan> {
  constructor() {
    super('plans', 'created_at');
  }
}
