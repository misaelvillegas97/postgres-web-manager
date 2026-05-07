import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-marketing-shell',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './marketing-shell.component.html',
  styleUrl: './marketing-shell.component.scss',
})
export class MarketingShellComponent {
  menuOpen = signal(false);
  toggleMenu(): void { this.menuOpen.update(v => !v); }
  closeMenu(): void { this.menuOpen.set(false); }
}
