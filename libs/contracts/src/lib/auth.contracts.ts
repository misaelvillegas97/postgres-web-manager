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
}

export interface RefreshTokenDto {
  refreshToken: string;
}
