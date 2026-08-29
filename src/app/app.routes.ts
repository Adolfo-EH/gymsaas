import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardPageComponent),
      },
      {
        path: 'reception',
        loadComponent: () =>
          import('./features/reception/reception.component').then((m) => m.ReceptionPageComponent),
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./features/clients/clients.component').then((m) => m.ClientsPageComponent),
      },
      {
        path: 'clients/:id',
        loadComponent: () =>
          import('./features/clients/client-profile.component').then((m) => m.ClientProfilePageComponent),
      },
      {
        path: 'cash-register',
        loadComponent: () =>
          import('./features/cash-register/cash-register.component').then((m) => m.CashRegisterPageComponent),
      },
      {
        path: 'plans',
        loadComponent: () =>
          import('./features/plans/plans.component').then((m) => m.PlansPageComponent),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./features/inventory/inventory.component').then((m) => m.InventoryPageComponent),
      },
    ]
  }
];
