import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { SEO_PAGES } from './core/seo/seo.config';

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
        title: SEO_PAGES.home.title,
        data: { seo: SEO_PAGES.home },
        loadComponent: () =>
          import('./features/landing/landing.component').then(
            (m) => m.LandingComponent,
          ),
      },
      {
        path: 'cloud',
        title: SEO_PAGES.cloud.title,
        data: { seo: SEO_PAGES.cloud },
        loadComponent: () =>
          import('./features/landing/cloud.component').then(
            (m) => m.CloudComponent,
          ),
      },
      {
        path: 'self-hosted',
        title: SEO_PAGES.selfHosted.title,
        data: { seo: SEO_PAGES.selfHosted },
        loadComponent: () =>
          import('./features/landing/self-hosted.component').then(
            (m) => m.SelfHostedComponent,
          ),
      },
      {
        path: 'deploy',
        title: SEO_PAGES.deploy.title,
        data: { seo: SEO_PAGES.deploy },
        loadComponent: () =>
          import('./features/landing/deploy.component').then(
            (m) => m.DeployComponent,
          ),
      },
      {
        path: 'docs',
        title: SEO_PAGES.docs.title,
        data: { seo: SEO_PAGES.docs },
        loadComponent: () =>
          import('./features/landing/docs.component').then(
            (m) => m.DocsComponent,
          ),
      },
      {
        path: 'pricing',
        title: SEO_PAGES.pricing.title,
        data: { seo: SEO_PAGES.pricing },
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
    title: SEO_PAGES.login.title,
    data: { seo: SEO_PAGES.login },
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    title: SEO_PAGES.register.title,
    data: { seo: SEO_PAGES.register },
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'confirm-email',
    title: SEO_PAGES.confirmEmail.title,
    data: { seo: SEO_PAGES.confirmEmail },
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'forgot-password',
    title: SEO_PAGES.forgotPassword.title,
    data: { seo: SEO_PAGES.forgotPassword },
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'reset-password',
    title: SEO_PAGES.resetPassword.title,
    data: { seo: SEO_PAGES.resetPassword },
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
        title: SEO_PAGES.workspace.title,
        data: { seo: SEO_PAGES.workspace },
        loadComponent: () =>
          import('./features/workspace/workspace.component').then(
            (m) => m.WorkspaceComponent,
          ),
      },
      {
        path: 'connections',
        title: SEO_PAGES.connections.title,
        data: { seo: SEO_PAGES.connections },
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
