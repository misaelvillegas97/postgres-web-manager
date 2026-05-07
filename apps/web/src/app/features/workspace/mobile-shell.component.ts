import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConnectionsService } from '../../core/services/connections.service';

@Component({
  selector: 'app-mobile-shell',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './mobile-shell.component.html',
  styleUrl: './mobile-shell.component.scss',
})
export class MobileShellComponent {
  protected auth = inject(AuthService);
  protected conn = inject(ConnectionsService);
}
