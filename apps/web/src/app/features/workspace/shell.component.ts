import { Component, inject } from '@angular/core';
import { ViewportService } from '../../core/services/viewport.service';
import { ConnectionsService } from '../../core/services/connections.service';
import { DesktopShellComponent } from './desktop-shell.component';
import { MobileShellComponent } from './mobile-shell.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [DesktopShellComponent, MobileShellComponent],
  template: `
    @if (viewport.isMobile()) {
      <app-mobile-shell />
    } @else {
      <app-desktop-shell />
    }
  `,
})
export class ShellComponent {
  protected viewport = inject(ViewportService);
  private conn = inject(ConnectionsService);

  constructor() {
    this.conn.loadAll().subscribe();
  }
}
