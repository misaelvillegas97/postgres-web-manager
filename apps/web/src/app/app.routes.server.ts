import { RenderMode, ServerRoute } from '@angular/ssr';
import { PRERENDERED_PUBLIC_PATHS } from './core/seo/seo.config';

export const serverRoutes: ServerRoute[] = [
  ...PRERENDERED_PUBLIC_PATHS.map(
    (path) =>
      ({
        path,
        renderMode: RenderMode.Prerender,
      }) satisfies ServerRoute,
  ),
  {
    path: 'login',
    renderMode: RenderMode.Client,
  },
  {
    path: 'register',
    renderMode: RenderMode.Client,
  },
  {
    path: 'confirm-email',
    renderMode: RenderMode.Client,
  },
  {
    path: 'forgot-password',
    renderMode: RenderMode.Client,
  },
  {
    path: 'reset-password',
    renderMode: RenderMode.Client,
  },
  {
    path: 'workspace',
    renderMode: RenderMode.Client,
  },
  {
    path: 'connections',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
