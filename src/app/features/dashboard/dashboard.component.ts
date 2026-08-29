import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService, TopProduct, Debtor } from '../../core/services/dashboard.service';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  providers: [DecimalPipe],
  templateUrl: './dashboard.component.html'
})
export class DashboardPageComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);

  // Estado
  loading = signal<boolean>(true);
  
  // KPIs
  todayRevenue = signal<number>(0);
  activeMembers = signal<number>(0);
  debtorsCount = signal<number>(0);

  // Tablas
  topProducts = signal<TopProduct[]>([]);
  debtorsList = signal<Debtor[]>([]);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      // Cargar todo en paralelo para mejor rendimiento
      const [
        revenue,
        members,
        debtors,
        products,
        debtorsList
      ] = await Promise.all([
        this.dashboardService.getTodayRevenue(),
        this.dashboardService.getActiveMembersCount(),
        this.dashboardService.getDebtorsCount(),
        this.dashboardService.getTopProducts(5),
        this.dashboardService.getDebtorsList(5)
      ]);

      this.todayRevenue.set(revenue);
      this.activeMembers.set(members);
      this.debtorsCount.set(debtors);
      this.topProducts.set(products);
      this.debtorsList.set(debtorsList);

    } catch (err) {
      console.error('[Dashboard] Error cargando KPIs:', err);
    } finally {
      this.loading.set(false);
    }
  }
}
// Trigger recompile
