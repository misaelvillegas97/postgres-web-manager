import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-card__logo">
          <span class="logo-icon">⬡</span>
          <span class="logo-text">PgStudio</span>
        </div>

        <h1 class="login-card__title">Sign in</h1>

        <form (ngSubmit)="submit()" #f="ngForm">
          <div class="field">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              [(ngModel)]="email"
              placeholder="you@example.com"
              required
              autocomplete="username"
            />
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              [(ngModel)]="password"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>

          @if (error()) {
            <p class="login-error">{{ error() }}</p>
          }

          <button
            type="submit"
            class="btn btn--primary login-btn"
            [disabled]="loading()"
          >
            @if (loading()) {
              <span class="spinner"></span> Signing in…
            } @else {
              Sign in
            }
          </button>
        </form>

        <p class="login-hint">Dev: <code>admin&#64;pgstudio.local</code> / <code>dev-password</code></p>
      </div>
    </div>
  `,
  styles: [`
    .login-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--bg-base);
    }

    .login-card {
      width: 360px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 36px 32px 28px;
    }

    .login-card__logo {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 24px;
    }

    .logo-icon {
      font-size: 24px;
      color: var(--accent);
    }

    .logo-text {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .login-card__title {
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 20px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 14px;

      label {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-secondary);
      }

      input { width: 100%; }
    }

    .login-error {
      font-size: 12px;
      color: var(--danger);
      margin-bottom: 10px;
    }

    .login-btn {
      width: 100%;
      justify-content: center;
      padding: 8px;
      font-size: 13px;
      margin-top: 4px;
    }

    .login-hint {
      margin-top: 16px;
      font-size: 11px;
      color: var(--text-muted);
      text-align: center;
      code { color: var(--text-secondary); }
    }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal('');

  submit() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.router.navigate(['/workspace']);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message ?? 'Invalid credentials';
        this.error.set(msg);
      },
    });
  }
}
