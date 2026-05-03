import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/workspace/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'workspace',
        loadComponent: () =>
          import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent),
      },
      {
        path: 'connections',
        loadComponent: () =>
          import('./features/connections/connections.component').then((m) => m.ConnectionsComponent),
      },
      { path: '', redirectTo: 'workspace', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '/workspace' },
];
