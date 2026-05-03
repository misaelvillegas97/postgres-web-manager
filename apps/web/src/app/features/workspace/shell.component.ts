import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConnectionsService } from '../../core/services/connections.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div class="shell">
      <!-- Top bar -->
      <header class="topbar">
        <div class="topbar__left">
          <span class="topbar__logo">⬡ PgStudio</span>
          @if (conn.activeConnection; as active) {
            <span class="topbar__conn-badge">
              <span class="topbar__conn-dot"></span>
              {{ active.name }} &mdash; {{ active.database }}
            </span>
          }
        </div>

        <nav class="topbar__nav">
          <a routerLink="/workspace" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">Query</a>
          <a routerLink="/connections" routerLinkActive="active">Connections</a>
        </nav>

        <div class="topbar__right">
          @if (auth.user(); as u) {
            <span class="topbar__user">{{ u.email }}</span>
          }
          <button class="btn btn--ghost btn--sm" (click)="auth.logout()">Sign out</button>
        </div>
      </header>

      <!-- Main content -->
      <main class="shell__content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .topbar {
      display: flex;
      align-items: center;
      gap: 16px;
      height: var(--topbar-h);
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 0 16px;
      flex-shrink: 0;
      z-index: 100;
    }

    .topbar__left {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
    }

    .topbar__logo {
      font-weight: 700;
      font-size: 15px;
      color: var(--text-primary);
    }

    .topbar__conn-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-elevated);
      padding: 2px 10px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }

    .topbar__conn-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
    }

    .topbar__nav {
      display: flex;
      gap: 4px;

      a {
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: var(--radius);
        transition: background 0.15s, color 0.15s;
        text-decoration: none;

        &:hover { background: var(--bg-hover); color: var(--text-primary); }
        &.active { background: var(--accent-dim); color: var(--accent); }
      }
    }

    .topbar__right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .topbar__user {
      font-size: 12px;
      color: var(--text-muted);
    }

    .shell__content {
      flex: 1;
      overflow: hidden;
    }
  `],
})
export class ShellComponent {
  protected auth = inject(AuthService);
  protected conn = inject(ConnectionsService);
}
