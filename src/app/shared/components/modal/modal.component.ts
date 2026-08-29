// ============================================================
// ModalComponent — Dumb Component Genérico de Modal
// Renderiza un overlay + panel con título y contenido proyectado.
// El padre controla la existencia con @if, el modal siempre
// se muestra cuando existe en el DOM.
// ============================================================

import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [],
  templateUrl: './modal.component.html',
})
export class ModalComponent {

  /** Título del modal */
  @Input() title = '';

  /** Ancho máximo del panel (clase Tailwind) */
  @Input() maxWidth = 'max-w-lg';

  /** Emite cuando el usuario cierra el modal (X o backdrop) */
  @Output() closed = new EventEmitter<void>();

  onBackdropClick(): void {
    this.closed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
