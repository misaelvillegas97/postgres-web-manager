import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, map, of, switchMap } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  const token = auth.getAccessToken();
  if (!token) {
    router.navigate(['/login']);
    return false;
  }

  const redirectToLogin = () => {
    router.navigate(['/login']);
    return of(false);
  };

  return auth.loadProfile().pipe(
    map(() => true),
    catchError(() => {
      return auth.refresh().pipe(
        switchMap(() => auth.loadProfile()),
        map(() => true),
        catchError(redirectToLogin),
      );
    }),
  );
};
