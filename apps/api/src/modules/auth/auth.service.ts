import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  AuthTokens,
  LoginDto,
  RefreshTokenDto,
  UserProfile,
  UserRole,
} from '@postgres-web-manager/contracts';
import { getEnv } from '../../config/env.config';

// ─── Dev-mode mock users ───────────────────────────────────────────────────────
// In production (Fase 7), this will be replaced by database lookups.
const MOCK_USERS: Array<UserProfile & { passwordHash: string }> = [
  {
    id: 'usr-001',
    email: 'admin@pgstudio.local',
    name: 'Admin User',
    role: UserRole.OWNER,
    workspaceId: 'ws-001',
    passwordHash: 'dev-password', // plain text ONLY for dev mock
  },
  {
    id: 'usr-002',
    email: 'dev@pgstudio.local',
    name: 'Developer',
    role: UserRole.DEVELOPER,
    workspaceId: 'ws-001',
    passwordHash: 'dev-password',
  },
];

const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // In-memory refresh token store for dev mode (Fase 7 → moves to Redis/DB)
  private readonly refreshTokens = new Set<string>();

  private get jwtSecret(): string {
    return getEnv().JWT_SECRET ?? 'dev-jwt-secret-not-for-production';
  }

  private get jwtRefreshSecret(): string {
    return getEnv().JWT_REFRESH_SECRET ?? 'dev-jwt-refresh-secret-not-for-production';
  }

  async login(dto: LoginDto): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const user = MOCK_USERS.find((u) => u.email === dto.email);
    if (!user || user.passwordHash !== dto.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = this.generateTokens(user);
    this.refreshTokens.add(tokens.refreshToken);

    const { passwordHash: _omit, ...userProfile } = user;
    this.logger.log(`User logged in: ${user.email}`);
    return { user: userProfile, tokens };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    if (!this.refreshTokens.has(dto.refreshToken)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    let payload: { sub: string; email: string; workspaceId: string };
    try {
      payload = jwt.verify(dto.refreshToken, this.jwtRefreshSecret) as typeof payload;
    } catch {
      this.refreshTokens.delete(dto.refreshToken);
      throw new UnauthorizedException('Refresh token verification failed');
    }

    const user = MOCK_USERS.find((u) => u.id === payload.sub);
    if (!user) {
      this.refreshTokens.delete(dto.refreshToken);
      throw new NotFoundException('User no longer exists');
    }

    // Rotate refresh token
    this.refreshTokens.delete(dto.refreshToken);
    const tokens = this.generateTokens(user);
    this.refreshTokens.add(tokens.refreshToken);
    return tokens;
  }

  async logout(dto: RefreshTokenDto): Promise<{ success: boolean }> {
    this.refreshTokens.delete(dto.refreshToken);
    return { success: true };
  }

  async me(accessToken: string): Promise<UserProfile> {
    let payload: { sub: string; workspaceId: string };
    try {
      payload = jwt.verify(accessToken, this.jwtSecret) as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = MOCK_USERS.find((u) => u.id === payload.sub);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _omit, ...userProfile } = user;
    return userProfile;
  }

  /** Verifies an access token and returns the decoded payload. Used by guards. */
  verifyAccessToken(token: string): {
    sub: string;
    email: string;
    workspaceId: string;
    role: UserRole;
  } {
    try {
      return jwt.verify(token, this.jwtSecret) as ReturnType<
        typeof this.verifyAccessToken
      >;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /** @deprecated Use getProfile() or me() instead */
  async getProfile(_userId: string): Promise<UserProfile> {
    return this.me(_userId);
  }

  private generateTokens(user: UserProfile): AuthTokens {
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId,
      },
      this.jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        workspaceId: user.workspaceId,
      },
      this.jwtRefreshSecret,
      { expiresIn: REFRESH_TOKEN_TTL },
    );

    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL };
  }
}
