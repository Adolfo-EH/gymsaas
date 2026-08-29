// ============================================================
// GYM SaaS — Domain Models
// Interfaces derivadas del esquema PostgreSQL de Supabase.
// Convención: camelCase para propiedades, PascalCase para tipos.
// ============================================================

// ----- Tipos utilitarios compartidos -----

/** Métodos de pago aceptados */
export type PaymentMethod = 'efectivo' | 'yape' | 'plin' | 'dividido';

/** Estado de pago de una membresía */
export type PaymentStatus = 'pagado' | 'deuda';

/** Tipo de transacción */
export type TransactionType = 'IN' | 'OUT';

/** Categoría de transacción */
export type TransactionCategory =
  | 'membresia'
  | 'pase_diario'
  | 'limpieza'
  | 'mantenimiento'
  | 'servicios'
  | 'minimarket'
  | 'otros';

/** Estado de una caja registradora */
export type CashRegisterStatus = 'open' | 'closed';

// ----- 1. Planes -----

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  createdAt: string;
}

/** DTO para crear un plan (campos autogenerados excluidos) */
export type PlanCreate = Omit<Plan, 'id' | 'createdAt'>;

/** DTO para actualizar un plan (todos los campos opcionales) */
export type PlanUpdate = Partial<PlanCreate>;

// ----- 2. Clientes -----

export interface Client {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: string;
}

export type ClientCreate = Omit<Client, 'id' | 'createdAt'>;

export type ClientUpdate = Partial<ClientCreate>;

/** Vista aplanada para la tabla de directorio de clientes */
export interface ClientWithMembership extends Client {
  /** ID de la membresía más reciente */
  membershipId: string | null;
  /** Fecha de inicio de la membresía más reciente (ISO date) */
  membershipStartDate: string | null;
  /** Fecha de vencimiento de la membresía más reciente (ISO date) */
  membershipEndDate: string | null;
  /** Nombre del plan de la membresía más reciente */
  membershipPlanName: string | null;
  /** Estado de pago de la membresía más reciente */
  membershipPaymentStatus: PaymentStatus | null;
  /** Estado calculado en frontend: 'Activo' | 'Vencido' | 'Por iniciar' | 'Sin membresía' */
  membershipStatus: 'Activo' | 'Vencido' | 'Por iniciar' | 'Sin membresía';
  /** Deuda pendiente de la membresía más reciente */
  membershipDebt?: number;
  /** Mora acumulada por retraso en el pago de la deuda */
  membershipLateFee?: number;
  /** Fecha de compromiso de pago de la deuda (ISO date) */
  membershipDebtDueDate?: string | null;
}

// ----- 3. Membresías -----

export interface Membership {
  id: string;
  clientId: string;
  planId: string;
  startDate: string;       // ISO date (YYYY-MM-DD)
  endDate: string;         // ISO date (YYYY-MM-DD)
  totalCost: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  debtDueDate: string | null; // ISO date (YYYY-MM-DD)
  notes: string | null;
  createdAt: string;
}

/** Membresía con relaciones expandidas (joins) */
export interface MembershipWithRelations extends Membership {
  client?: Client;
  plan?: Plan;
}

export interface MembershipWithDetails extends Membership {
  plans?: Pick<Plan, 'name'>;
  clients?: Pick<Client, 'firstName' | 'lastName'>;
}

// ----- 4. Inventario (Minimarket) -----

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  createdAt: string;
}

export type ProductCreate = Omit<Product, 'id' | 'createdAt'>;

// ----- Otros Modelos Secundarios -----

export type MembershipCreate = Omit<Membership, 'id' | 'createdAt'>;

export type MembershipUpdate = Partial<MembershipCreate>;

// ----- 5. Cajas Registradoras -----

export interface CashRegister {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  expectedCashBalance: number;
  actualCashBalance: number | null;
  status: CashRegisterStatus;
}

export type CashRegisterCreate = Pick<CashRegister, 'openingBalance'>;

export type CashRegisterClose = Pick<CashRegister, 'actualCashBalance'>;

// ----- 5. Transacciones -----

export interface Transaction {
  id: string;
  cashRegisterId: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string | null;
  referenceId: string | null;
  createdAt: string;
}

export type TransactionCreate = Omit<Transaction, 'id' | 'createdAt'>;

export type TransactionUpdate = Partial<TransactionCreate>;

// ----- Tipos utilitarios para tablas genéricas -----

/** Configuración de columna para el componente genérico de tabla */
export interface TableColumn<T> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  type?: 'text' | 'number' | 'currency' | 'date' | 'badge';
  /** Función para transformar el valor mostrado */
  transform?: (value: unknown, row: T) => string;
  /** Clases Tailwind condicionales para badges, indexadas por valor */
  badgeClasses?: Record<string, string>;
}

/** Configuración de botones de acción por fila en DataTable */
export interface TableActionConfig {
  action: string;
  label: string;
  icon?: 'edit' | 'delete' | 'view' | 'add';
  color?: string;
}

/** Acción disponible en cada fila de una tabla genérica */
export interface TableAction<T> {
  icon: string;
  label: string;
  color?: 'primary' | 'warn' | 'danger';
  action: (row: T) => void;
  visible?: (row: T) => boolean;
}

/** Configuración genérica de paginación */
export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
}

// ----- 6. Asistencias -----

export interface Attendance {
  id: string;
  clientId: string;
  membershipId: string | null;
  checkInTime: string;
  accessType?: string;
}
