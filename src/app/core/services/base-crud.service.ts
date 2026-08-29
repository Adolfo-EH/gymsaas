// ============================================================
// Base CRUD Service — Servicio Genérico con Signals
// Gestiona estado reactivo (items, loading, error) y operaciones
// CRUD contra cualquier tabla de Supabase.
//
// Uso: los servicios de cada feature extienden esta clase.
//   export class PlansService extends BaseCrudService<Plan> {
//     constructor(supabase: SupabaseService) {
//       super(supabase, 'plans');
//     }
//   }
// ============================================================

import { inject, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { toCamelCase, toSnakeCase, mapArrayToCamelCase } from '../utils/mapper.util';

/**
 * Interfaz mínima que toda entidad del dominio debe cumplir.
 * Garantiza que el servicio pueda identificar filas por `id`.
 */
interface Identifiable {
  id: string;
}

export abstract class BaseCrudService<T extends Identifiable> {
  protected readonly supabaseService = inject(SupabaseService);

  // ─── Estado reactivo con Signals ───────────────────────────
  private readonly _items = signal<T[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  /** Lista reactiva de todos los items cargados */
  readonly items = this._items.asReadonly();

  /** Indica si hay una operación en curso */
  readonly loading = this._loading.asReadonly();

  /** Último mensaje de error, o null si no hay error */
  readonly error = this._error.asReadonly();

  /** Total de items cargados (derivado) */
  readonly count = computed(() => this._items().length);

  /** Indica si la lista está vacía (derivado) */
  readonly isEmpty = computed(() => this._items().length === 0);

  /**
   * @param tableName Nombre de la tabla en Supabase (snake_case, ej: 'cash_registers')
   * @param defaultOrderBy Columna para ordenar por defecto (snake_case)
   */
  constructor(
    protected readonly tableName: string,
    protected readonly defaultOrderBy: string = 'created_at',
  ) {}

  /**
   * Acceso directo al cliente Supabase para queries custom en features.
   */
  protected get supabase() {
    return this.supabaseService.supabase;
  }

  // ─── CRUD Operations ──────────────────────────────────────

  /**
   * Carga todos los registros de la tabla.
   * Opcionalmente recibe un `select` para JOINs (ej: '*, clients(*), plans(*)').
   */
  async getAll(select: string = '*'): Promise<T[]> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(select)
        .order(this.defaultOrderBy, { ascending: false });

      if (error) {
        throw error;
      }

      const mapped = mapArrayToCamelCase<T>(data as unknown as Record<string, unknown>[]);
      this._items.set(mapped);
      return mapped;
    } catch (err) {
      const message = this.extractErrorMessage(err);
      this._error.set(message);
      console.error(`[BaseCrudService:${this.tableName}] getAll error:`, err);
      return [];
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Obtiene un registro por su ID.
   * No altera el estado de `items`, solo retorna el resultado.
   */
  async getById(id: string, select: string = '*'): Promise<T | null> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(select)
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return toCamelCase<T>(data as unknown as Record<string, unknown>);
    } catch (err) {
      const message = this.extractErrorMessage(err);
      this._error.set(message);
      console.error(`[BaseCrudService:${this.tableName}] getById error:`, err);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Crea un nuevo registro.
   * Convierte el DTO de camelCase a snake_case antes de enviarlo.
   * Actualiza la lista de items automáticamente al tener éxito.
   */
  async create(dto: Partial<T>): Promise<T | null> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const snakeCaseDto = toSnakeCase(dto as Record<string, unknown>);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(snakeCaseDto)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const created = toCamelCase<T>(data as unknown as Record<string, unknown>);

      // Agregar al inicio de la lista (más reciente primero)
      this._items.update((current) => [created, ...current]);

      return created;
    } catch (err) {
      const message = this.extractErrorMessage(err);
      this._error.set(message);
      console.error(`[BaseCrudService:${this.tableName}] create error:`, err);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Actualiza un registro existente por su ID.
   * Convierte el DTO de camelCase a snake_case antes de enviarlo.
   * Actualiza el item en la lista de items automáticamente.
   */
  async update(id: string, dto: Partial<T>): Promise<T | null> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const snakeCaseDto = toSnakeCase(dto as Record<string, unknown>);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(snakeCaseDto)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const updated = toCamelCase<T>(data as unknown as Record<string, unknown>);

      // Reemplazar el item en la lista
      this._items.update((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );

      return updated;
    } catch (err) {
      const message = this.extractErrorMessage(err);
      this._error.set(message);
      console.error(`[BaseCrudService:${this.tableName}] update error:`, err);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Elimina un registro por su ID.
   * Remueve el item de la lista automáticamente al tener éxito.
   */
  async delete(id: string): Promise<boolean> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      // Remover de la lista local
      this._items.update((current) => current.filter((item) => item.id !== id));

      return true;
    } catch (err) {
      const message = this.extractErrorMessage(err);
      this._error.set(message);
      console.error(`[BaseCrudService:${this.tableName}] delete error:`, err);
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  /** Limpia el error actual */
  clearError(): void {
    this._error.set(null);
  }

  /** Limpia todo el estado del servicio */
  reset(): void {
    this._items.set([]);
    this._loading.set(false);
    this._error.set(null);
  }

  /**
   * Extrae un mensaje de error legible de cualquier excepción.
   */
  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
