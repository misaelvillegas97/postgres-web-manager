import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, EMPTY, tap, throwError } from 'rxjs';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: string;
  workspaceId?: string;
  emailVerified?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface AuthMessageResponse {
  success: boolean;
  message: string;
  expiresIn?: number;
  devOtp?: string;
}

const ACCESS_TOKEN_KEY = 'pgstudio_at';
const REFRESH_TOKEN_KEY = 'pgstudio_rt';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private _user = signal<UserProfile | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  private storeTokens(tokens: AuthTokens): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  private clearTokens(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(
        tap((response) => {
          this.storeTokens(response.tokens);
          this._user.set(response.user);
        }),
      );
  }

  register(email: string, password: string, name?: string) {
    return this.http.post<AuthMessageResponse>('/api/auth/register', {
      email,
      password,
      name,
    });
  }

  confirmEmail(email: string, otp: string) {
    return this.http.post<AuthMessageResponse>('/api/auth/confirm-email', {
      email,
      otp,
    });
  }

  forgotPassword(email: string) {
    return this.http.post<AuthMessageResponse>('/api/auth/forgot-password', {
      email,
    });
  }

  resetPassword(email: string, otp: string, password: string) {
    return this.http.post<AuthMessageResponse>('/api/auth/reset-password', {
      email,
      otp,
      password,
    });
  }

  refresh() {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return throwError(() => new Error('No refresh token'));
    return this.http
      .post<AuthTokens>('/api/auth/refresh', { refreshToken })
      .pipe(
        tap((tokens) => this.storeTokens(tokens)),
        catchError((err) => {
          this.logout();
          return throwError(() => err);
        }),
      );
  }

  logout() {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      this.http
        .post('/api/auth/logout', { refreshToken })
        .pipe(catchError(() => EMPTY))
        .subscribe();
    }
    this.clearTokens();
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  loadProfile() {
    return this.http.get<UserProfile>('/api/auth/me').pipe(
      tap((user) => this._user.set(user)),
      catchError((err) => {
        this._user.set(null);
        return throwError(() => err);
      }),
    );
  }
}
