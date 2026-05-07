import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

type AuthMode = 'login' | 'register' | 'confirm' | 'forgot' | 'reset';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  otp = '';
  mode = signal<AuthMode>('login');
  loading = signal(false);
  error = signal('');
  success = signal('');

  constructor() {
    this.route.url.subscribe((segments) => {
      this.mode.set(this.modeFromPath(segments[0]?.path ?? 'login'));
      this.clearFeedback();
    });
    this.route.queryParamMap.subscribe((params) => {
      const email = params.get('email');
      if (email) this.email = email;
    });
  }

  get title(): string {
    switch (this.mode()) {
      case 'register':
        return 'Create account';
      case 'confirm':
        return 'Confirm email';
      case 'forgot':
        return 'Reset access';
      case 'reset':
        return 'Set new password';
      default:
        return 'Sign in';
    }
  }

  get subtitle(): string {
    switch (this.mode()) {
      case 'register':
        return 'Start a PgStudio Gateway workspace';
      case 'confirm':
        return 'Enter the code sent to your email';
      case 'forgot':
        return 'Request a password reset code';
      case 'reset':
        return 'Use your code to continue';
      default:
        return 'Continue to PgStudio Gateway';
    }
  }

  get submitLabel(): string {
    switch (this.mode()) {
      case 'register':
        return 'Create account';
      case 'confirm':
        return 'Confirm email';
      case 'forgot':
        return 'Send code';
      case 'reset':
        return 'Reset password';
      default:
        return 'Sign in';
    }
  }

  submit() {
    if (this.loading()) return;
    switch (this.mode()) {
      case 'register':
        this.register();
        break;
      case 'confirm':
        this.confirmEmail();
        break;
      case 'forgot':
        this.forgotPassword();
        break;
      case 'reset':
        this.resetPassword();
        break;
      default:
        this.login();
        break;
    }
  }

  private login() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.clearFeedback();

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

  private register() {
    if (!this.email || !this.password) return;
    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }
    this.loading.set(true);
    this.clearFeedback();

    this.auth.register(this.email, this.password, this.name).subscribe({
      next: () => {
        this.loading.set(false);
        this.password = '';
        this.confirmPassword = '';
        this.otp = '';
        this.mode.set('confirm');
        this.success.set('Account created. Enter the verification code.');
      },
      error: (err) => this.showError(err, 'Could not create account'),
    });
  }

  private confirmEmail() {
    if (!this.email || !this.otp) return;
    this.loading.set(true);
    this.clearFeedback();

    this.auth.confirmEmail(this.email, this.otp).subscribe({
      next: () => {
        this.loading.set(false);
        this.otp = '';
        this.mode.set('login');
        this.success.set('Email confirmed. You can sign in now.');
      },
      error: (err) => this.showError(err, 'Could not confirm email'),
    });
  }

  private forgotPassword() {
    if (!this.email) return;
    this.loading.set(true);
    this.clearFeedback();

    this.auth.forgotPassword(this.email).subscribe({
      next: () => {
        this.loading.set(false);
        this.otp = '';
        this.password = '';
        this.confirmPassword = '';
        this.mode.set('reset');
        this.success.set('Enter the reset code to set a new password.');
      },
      error: (err) => this.showError(err, 'Could not request reset code'),
    });
  }

  private resetPassword() {
    if (!this.email || !this.otp || !this.password) return;
    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }
    this.loading.set(true);
    this.clearFeedback();

    this.auth.resetPassword(this.email, this.otp, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.password = '';
        this.confirmPassword = '';
        this.otp = '';
        this.mode.set('login');
        this.success.set('Password reset. You can sign in now.');
      },
      error: (err) => this.showError(err, 'Could not reset password'),
    });
  }

  private showError(err: { error?: { message?: string } }, fallback: string) {
    this.loading.set(false);
    const msg = err?.error?.message ?? fallback;
    this.error.set(msg);
  }

  private clearFeedback() {
    this.error.set('');
    this.success.set('');
  }

  private modeFromPath(path: string): AuthMode {
    switch (path) {
      case 'register':
        return 'register';
      case 'confirm-email':
        return 'confirm';
      case 'forgot-password':
        return 'forgot';
      case 'reset-password':
        return 'reset';
      default:
        return 'login';
    }
  }
}
