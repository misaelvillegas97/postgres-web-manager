export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
  READ_ONLY = 'READ_ONLY',
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name?: string;
  workspaceName?: string;
}

export enum AuthOtpPurpose {
  EMAIL_CONFIRMATION = 'EMAIL_CONFIRMATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

export interface ConfirmEmailDto {
  email: string;
  otp: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  otp: string;
  password: string;
}

export interface AuthMessageResponse {
  success: boolean;
  message: string;
  expiresIn?: number;
  devOtp?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  workspaceId: string;
  emailVerified: boolean;
}

export interface RefreshTokenDto {
  refreshToken: string;
}
