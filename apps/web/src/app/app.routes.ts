import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Route[] = [
  // ── Marketing pages (shared header + footer shell) ──────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/marketing-shell.component').then(
        (m) => m.MarketingShellComponent,
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/landing/landing.component').then(
            (m) => m.LandingComponent,
          ),
      },
      {
        path: 'cloud',
        loadComponent: () =>
          import('./features/landing/cloud.component').then(
            (m) => m.CloudComponent,
          ),
      },
      {
        path: 'self-hosted',
        loadComponent: () =>
          import('./features/landing/self-hosted.component').then(
            (m) => m.SelfHostedComponent,
          ),
      },
      {
        path: 'deploy',
        loadComponent: () =>
          import('./features/landing/deploy.component').then(
            (m) => m.DeployComponent,
          ),
      },
      {
        path: 'docs',
        loadComponent: () =>
          import('./features/landing/docs.component').then(
            (m) => m.DocsComponent,
          ),
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./features/landing/pricing.component').then(
            (m) => m.PricingComponent,
          ),
      },
    ],
  },
  // ── Auth ────────────────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  // ── Protected app shell ─────────────────────────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./features/workspace/shell.component').then(
        (m) => m.ShellComponent,
      ),
    canActivate: [authGuard],
    children: [
      {
        path: 'workspace',
        loadComponent: () =>
          import('./features/workspace/workspace.component').then(
            (m) => m.WorkspaceComponent,
          ),
      },
      {
        path: 'connections',
        loadComponent: () =>
          import('./features/connections/connections.component').then(
            (m) => m.ConnectionsComponent,
          ),
      },
      { path: '', redirectTo: 'workspace', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
