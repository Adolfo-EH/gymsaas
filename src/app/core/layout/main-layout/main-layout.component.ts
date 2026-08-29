import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './main-layout.component.html'
})
export class MainLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  isMobileOpen = signal(false);

  toggleMobileMenu(): void {
    this.isMobileOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.isMobileOpen.set(false);
  }

  async signOut() {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
}
