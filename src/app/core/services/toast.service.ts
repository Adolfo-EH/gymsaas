import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSignal = signal<Toast[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  success(message: string) {
    this.show('success', message);
  }

  error(message: string) {
    this.show('error', message);
  }

  info(message: string) {
    this.show('info', message);
  }

  remove(id: string) {
    this.toastsSignal.update(toasts => toasts.filter(t => t.id !== id));
  }

  private show(type: ToastType, message: string) {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, type, message };
    
    this.toastsSignal.update(toasts => [...toasts, newToast]);

    // Auto remove after 4 seconds
    setTimeout(() => {
      this.remove(id);
    }, 4000);
  }
}
