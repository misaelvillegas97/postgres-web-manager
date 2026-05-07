import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConnectionsService } from '../../core/services/connections.service';

@Component({
  selector: 'app-desktop-shell',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './desktop-shell.component.html',
  styleUrl: './desktop-shell.component.scss',
})
export class DesktopShellComponent {
  protected auth = inject(AuthService);
  protected conn = inject(ConnectionsService);
}
