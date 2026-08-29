import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Product, ProductCreate } from '../models/models';
import { toCamelCase, toSnakeCase } from '../utils/mapper.util';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly supabase = inject(SupabaseService).supabase;

  // State
  private productsSignal = signal<Product[]>([]);
  readonly products = this.productsSignal.asReadonly();

  private loadingSignal = signal<boolean>(false);
  readonly loading = this.loadingSignal.asReadonly();

  private errorSignal = signal<string | null>(null);
  readonly error = this.errorSignal.asReadonly();

  /**
   * Obtiene todos los productos ordenados por nombre
   */
  async getProducts(): Promise<Product[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      const mapped = (data || []).map(item => toCamelCase<Product>(item));
      this.productsSignal.set(mapped);
      return mapped;
    } catch (err: any) {
      console.error('[InventoryService] getProducts error:', err);
      this.errorSignal.set(err.message || 'Error al cargar productos');
      return [];
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Agrega un nuevo producto al catálogo
   */
  async addProduct(product: ProductCreate): Promise<Product | null> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const snakeData = toSnakeCase(product as Record<string, unknown>);
      
      const { data, error } = await this.supabase
        .from('products')
        .insert(snakeData)
        .select()
        .single();

      if (error) throw error;

      const newProduct = toCamelCase<Product>(data);
      // Actualizar el estado local
      const current = this.productsSignal();
      this.productsSignal.set([...current, newProduct].sort((a, b) => a.name.localeCompare(b.name)));
      
      return newProduct;
    } catch (err: any) {
      console.error('[InventoryService] addProduct error:', err);
      this.errorSignal.set(err.message || 'Error al agregar producto');
      return null;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Actualiza el precio de un producto
   */
  async updateProductPrice(id: string, newPrice: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const { error } = await this.supabase
        .from('products')
        .update({ price: newPrice })
        .eq('id', id);

      if (error) throw error;

      // Actualizar el estado local
      this.productsSignal.update(products => 
        products.map(p => p.id === id ? { ...p, price: newPrice } : p)
      );
    } catch (err: any) {
      console.error('[InventoryService] updateProductPrice error:', err);
      this.errorSignal.set(err.message || 'Error al actualizar el precio');
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Suma stock al producto actual
   */
  async addStock(id: string, quantityToAdd: number): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      // Necesitamos obtener el stock actual y sumarle
      const { data: currentData, error: readError } = await this.supabase
        .from('products')
        .select('stock')
        .eq('id', id)
        .single();
        
      if (readError) throw readError;
      
      const newStock = (currentData.stock || 0) + quantityToAdd;
      
      const { error: updateError } = await this.supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', id);

      if (updateError) throw updateError;

      // Actualizar el estado local
      this.productsSignal.update(products => 
        products.map(p => p.id === id ? { ...p, stock: newStock } : p)
      );
    } catch (err: any) {
      console.error('[InventoryService] addStock error:', err);
      this.errorSignal.set(err.message || 'Error al actualizar el stock');
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }
}
