import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Product, TableColumn, TableActionConfig } from '@core';
import { InventoryService } from '../../core/services/inventory.service';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DataTableComponent, ModalComponent],
  templateUrl: './inventory.component.html',
})
export class InventoryPageComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);
  private readonly fb = inject(FormBuilder);

  // State
  products = this.inventoryService.products;
  loading = this.inventoryService.loading;
  error = this.inventoryService.error;

  // Modals state
  showNewProductModal = signal(false);
  showEditPriceModal = signal(false);
  showAddStockModal = signal(false);

  // Selected Product for actions
  selectedProduct = signal<Product | null>(null);

  // Forms
  productForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
  });

  priceForm: FormGroup = this.fb.group({
    price: [0, [Validators.required, Validators.min(0)]],
  });

  stockForm: FormGroup = this.fb.group({
    quantity: [0, [Validators.required, Validators.min(1)]],
  });

  // DataTable Configuration
  columns: TableColumn<Product>[] = [
    { key: 'name', label: 'Producto', type: 'text' },
    { key: 'price', label: 'Precio de Venta', type: 'currency' },
    { 
      key: 'stock', 
      label: 'Stock Actual', 
      type: 'badge',
      transform: (value: unknown) => {
        const stock = Number(value);
        if (stock === 0) return 'Agotado';
        if (stock < 5) return 'Poco Stock';
        return 'Suficiente';
      },
      badgeClasses: {
        'Agotado': 'bg-red-100 text-red-700 font-bold',
        'Poco Stock': 'bg-amber-100 text-amber-700',
        'Suficiente': 'bg-emerald-100 text-emerald-700',
      }
    },
    // Añadimos una columna para mostrar la cantidad exacta
    { key: 'stock', label: 'Cant. Disponible', type: 'number' }
  ];

  tableActions: TableActionConfig[] = [
    { action: 'edit_price', label: 'Editar Precio', icon: 'edit', color: 'text-blue-600 hover:text-blue-800' },
    { action: 'add_stock', label: 'Ingresar Mercadería', icon: 'add', color: 'text-emerald-600 hover:text-emerald-800' },
  ];

  ngOnInit(): void {
    this.inventoryService.getProducts();
  }

  // Action Handler
  handleRowAction(event: { action: string; row: Product }): void {
    this.selectedProduct.set(event.row);

    if (event.action === 'edit_price') {
      this.priceForm.reset({ price: event.row.price });
      this.showEditPriceModal.set(true);
    } else if (event.action === 'add_stock') {
      this.stockForm.reset({ quantity: 1 });
      this.showAddStockModal.set(true);
    }
  }

  // --- Modal: New Product ---
  openNewProductModal(): void {
    this.productForm.reset({ name: '', price: 0, stock: 0 });
    this.showNewProductModal.set(true);
  }

  closeNewProductModal(): void {
    this.showNewProductModal.set(false);
  }

  async submitNewProduct(): Promise<void> {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }
    await this.inventoryService.addProduct(this.productForm.value);
    this.closeNewProductModal();
  }

  // --- Modal: Edit Price ---
  closeEditPriceModal(): void {
    this.showEditPriceModal.set(false);
    this.selectedProduct.set(null);
  }

  async submitEditPrice(): Promise<void> {
    if (this.priceForm.invalid) {
      this.priceForm.markAllAsTouched();
      return;
    }
    const product = this.selectedProduct();
    if (product) {
      await this.inventoryService.updateProductPrice(product.id, this.priceForm.value.price);
      this.closeEditPriceModal();
    }
  }

  // --- Modal: Add Stock ---
  closeAddStockModal(): void {
    this.showAddStockModal.set(false);
    this.selectedProduct.set(null);
  }

  async submitAddStock(): Promise<void> {
    if (this.stockForm.invalid) {
      this.stockForm.markAllAsTouched();
      return;
    }
    const product = this.selectedProduct();
    if (product) {
      await this.inventoryService.addStock(product.id, this.stockForm.value.quantity);
      this.closeAddStockModal();
    }
  }
}
