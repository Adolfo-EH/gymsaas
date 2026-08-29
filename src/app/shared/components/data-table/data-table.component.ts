// ============================================================
// DataTableComponent — Dumb Component Genérico de Tabla
// Renderiza datos + columnas configurables + acciones por fila.
// NO inyecta servicios. Solo recibe datos y emite eventos.
// ============================================================

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TableColumn, TableActionConfig } from '@core';
import { parseLocalDate } from '@core/utils/date.util';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [],
  templateUrl: './data-table.component.html',
})
export class DataTableComponent<T> {

  /** Definición de columnas a renderizar */
  @Input() columns: TableColumn<T>[] = [];

  /** Array de datos a mostrar en la tabla */
  @Input() data: T[] = [];

  /** Botones de acción por fila (por defecto: Editar y Eliminar) */
  @Input() actions: TableActionConfig[] = [
    { action: 'edit', label: 'Editar', icon: 'edit', color: 'text-blue-600 hover:text-blue-800' },
    { action: 'delete', label: 'Eliminar', icon: 'delete', color: 'text-red-500 hover:text-red-700' },
  ];

  /** Indica si la tabla está cargando datos */
  @Input() loading = false;

  /** Mensaje cuando no hay datos */
  @Input() emptyMessage = 'No hay datos para mostrar';

  /** Emite la acción ejecutada y la fila afectada */
  @Output() rowAction = new EventEmitter<{ action: string; row: T }>();

  // ─── Métodos del template ──────────────────────────────────

  /**
   * Obtiene el valor formateado de una celda según el tipo de columna.
   */
  getCellValue(row: T, col: TableColumn<T>): string {
    const rawValue = (row as Record<string, unknown>)[col.key as string];

    // Si tiene transform personalizado, usarlo primero
    if (col.transform) {
      return col.transform(rawValue, row);
    }

    if (rawValue === null || rawValue === undefined) {
      return '—';
    }

    switch (col.type) {
      case 'currency':
        return `S/ ${Number(rawValue).toFixed(2)}`;
      case 'date': {
        const rawStr = String(rawValue);
        // Fechas puras YYYY-MM-DD: parsear como local para evitar desfase UTC
        const dateObj = (rawStr.length === 10 && !rawStr.includes('T'))
          ? parseLocalDate(rawStr)
          : new Date(rawStr);
        return dateObj.toLocaleDateString('es-PE', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        });
      }
      case 'number':
        return Number(rawValue).toLocaleString('es-PE');
      default:
        return String(rawValue);
    }
  }

  /**
   * Devuelve las clases CSS para un badge según el valor de la celda.
   */
  getBadgeClasses(row: T, col: TableColumn<T>): string {
    if (!col.badgeClasses) {
      return 'bg-gray-100 text-gray-700';
    }
    const value = this.getCellValue(row, col);
    return col.badgeClasses[value] ?? 'bg-gray-100 text-gray-700';
  }

  /**
   * Emite un evento de acción con la fila correspondiente.
   */
  onAction(action: string, row: T): void {
    this.rowAction.emit({ action, row });
  }
}
