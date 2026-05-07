import type { AuthMessageResponse } from '@postgres-web-manager/contracts';
import { AuthService } from './auth.service';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function requireDevOtp(response: AuthMessageResponse): string {
  expect(response.devOtp).toMatch(/^\d{6}$/);
  return response.devOtp as string;
}

describe('AuthService OTP account lifecycle', () => {
  it('registers an account, requires email confirmation, then logs in', async () => {
    const service = new AuthService(null);
    const email = uniqueEmail('register');
    const password = 'valid-password';

    const registerResponse = await service.register({
      email,
      password,
      name: 'Register Test',
    });
    const otp = requireDevOtp(registerResponse);

    await expect(service.login({ email, password })).rejects.toThrow(
      'Email confirmation required',
    );

    await expect(service.confirmEmail({ email, otp })).resolves.toEqual({
      success: true,
      message: 'Email confirmed successfully',
    });

    const loginResponse = await service.login({ email, password });
    expect(loginResponse.user.email).toBe(email);
    expect(loginResponse.user.emailVerified).toBe(true);
    expect(loginResponse.tokens.accessToken).toBeTruthy();
  });

  it('resets a confirmed account password with a password reset OTP', async () => {
    const service = new AuthService(null);
    const email = uniqueEmail('reset');
    const oldPassword = 'old-password';
    const newPassword = 'new-password';

    const registerResponse = await service.register({
      email,
      password: oldPassword,
      name: 'Reset Test',
    });
    await service.confirmEmail({
      email,
      otp: requireDevOtp(registerResponse),
    });

    const forgotResponse = await service.forgotPassword({ email });
    await service.resetPassword({
      email,
      otp: requireDevOtp(forgotResponse),
      password: newPassword,
    });

    await expect(
      service.login({ email, password: oldPassword }),
    ).rejects.toThrow('Invalid email or password');

    const loginResponse = await service.login({
      email,
      password: newPassword,
    });
    expect(loginResponse.user.email).toBe(email);
  });
});
