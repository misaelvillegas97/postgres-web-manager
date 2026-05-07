import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, pbkdf2Sync, timingSafeEqual } from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  type AuthTokens,
  type LoginDto,
  type RefreshTokenDto,
  type UserProfile,
  UserRole,
} from '@postgres-web-manager/contracts';
import { getEnv } from '../../config/env.config';
import { INTERNAL_DB_POOL } from '../../database/database.module';

type MockUser = UserProfile & { passwordHash: string };
type UserRecord = UserProfile & { passwordHash: string };
type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  workspace_id: string;
  password_hash: string;
};
type RefreshTokenRow = {
  user_id: string;
};

const DEV_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000101';
const DEVELOPER_USER_ID = '00000000-0000-4000-8000-000000000102';
const DEV_PASSWORD_HASH =
  'pbkdf2-sha256$310000$dev-auth-seed-v1$a86JLRoEH3UNTahi8fUaFRFA86V2fhPsYXQ9NTFXFxI';

// Used only when no internal database is configured.
const MOCK_USERS: MockUser[] = [
  {
    id: ADMIN_USER_ID,
    email: 'admin@pgstudio.local',
    name: 'Admin User',
    role: UserRole.OWNER,
    workspaceId: DEV_WORKSPACE_ID,
    passwordHash: DEV_PASSWORD_HASH,
  },
  {
    id: DEVELOPER_USER_ID,
    email: 'dev@pgstudio.local',
    name: 'Developer',
    role: UserRole.DEVELOPER,
    workspaceId: DEV_WORKSPACE_ID,
    passwordHash: DEV_PASSWORD_HASH,
  },
];

const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Used only when no internal database is configured.
  private readonly refreshTokens = new Set<string>();

  constructor(@Inject(INTERNAL_DB_POOL) private readonly db: Pool | null) {}

  private get jwtSecret(): string {
    return getEnv().JWT_SECRET ?? 'dev-jwt-secret-not-for-production';
  }

  private get jwtRefreshSecret(): string {
    return (
      getEnv().JWT_REFRESH_SECRET ?? 'dev-jwt-refresh-secret-not-for-production'
    );
  }

  async login(
    dto: LoginDto,
  ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const user = await this.findUserByEmail(dto.email);
    if (!user || !this.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = this.generateTokens(user);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`User logged in: ${user.email}`);
    return { user: this.toUserProfile(user), tokens };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    let payload: { sub: string; email: string; workspaceId: string };
    try {
      payload = jwt.verify(
        dto.refreshToken,
        this.jwtRefreshSecret,
      ) as typeof payload;
    } catch {
      await this.revokeRefreshToken(dto.refreshToken);
      throw new UnauthorizedException('Refresh token verification failed');
    }

    const user = await this.findUserById(payload.sub);
    if (!user) {
      await this.revokeRefreshToken(dto.refreshToken);
      throw new NotFoundException('User no longer exists');
    }

    const tokens = this.generateTokens(user);
    const rotated = await this.rotateRefreshToken(
      dto.refreshToken,
      tokens.refreshToken,
    );
    if (!rotated) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.storeRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(dto: RefreshTokenDto): Promise<{ success: boolean }> {
    await this.revokeRefreshToken(dto.refreshToken);
    return { success: true };
  }

  async me(accessToken: string): Promise<UserProfile> {
    let payload: { sub: string; workspaceId: string };
    try {
      payload = jwt.verify(accessToken, this.jwtSecret) as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.findUserById(payload.sub);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserProfile(user);
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
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toUserProfile(user);
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
        jti: uuidv4(),
      },
      this.jwtRefreshSecret,
      { expiresIn: REFRESH_TOKEN_TTL },
    );

    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL };
  }

  private async findUserByEmail(
    email: string,
  ): Promise<UserRecord | undefined> {
    if (!this.db) {
      return MOCK_USERS.find(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
      );
    }

    const { rows } = await this.db.query<UserRow>(
      `SELECT id, email, display_name, role, workspace_id, password_hash
       FROM users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email],
    );
    return rows[0] ? this.toUserRecord(rows[0]) : undefined;
  }

  private async findUserById(id: string): Promise<UserRecord | undefined> {
    if (!this.db) {
      return MOCK_USERS.find((u) => u.id === id);
    }

    const { rows } = await this.db.query<UserRow>(
      `SELECT id, email, display_name, role, workspace_id, password_hash
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return rows[0] ? this.toUserRecord(rows[0]) : undefined;
  }

  private verifyPassword(password: string, passwordHash: string): boolean {
    const [algorithm, iterationsText, salt, expectedHash] =
      passwordHash.split('$');
    if (
      algorithm !== 'pbkdf2-sha256' ||
      !iterationsText ||
      !salt ||
      !expectedHash
    ) {
      return false;
    }

    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations < 100_000) {
      return false;
    }

    const actual = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    const expected = Buffer.from(expectedHash, 'base64url');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    if (!this.db) {
      this.refreshTokens.add(refreshToken);
      return;
    }

    await this.db.query(
      `INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [
        userId,
        this.hashToken(refreshToken),
        new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
      ],
    );
  }

  private async rotateRefreshToken(
    oldToken: string,
    newToken: string,
  ): Promise<boolean> {
    if (!this.db) {
      if (!this.refreshTokens.has(oldToken)) {
        return false;
      }
      this.refreshTokens.delete(oldToken);
      this.refreshTokens.add(newToken);
      return true;
    }

    const { rows } = await this.db.query<RefreshTokenRow>(
      `UPDATE auth_refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       RETURNING user_id`,
      [this.hashToken(oldToken)],
    );
    return rows.length === 1;
  }

  private async revokeRefreshToken(refreshToken: string): Promise<void> {
    if (!this.db) {
      this.refreshTokens.delete(refreshToken);
      return;
    }

    await this.db.query(
      `UPDATE auth_refresh_tokens
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE token_hash = $1`,
      [this.hashToken(refreshToken)],
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toUserRecord(row: UserRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      name: row.display_name ?? row.email,
      role: row.role,
      workspaceId: row.workspace_id,
      passwordHash: row.password_hash,
    };
  }

  private toUserProfile(user: UserRecord): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: user.workspaceId,
    };
  }
}
