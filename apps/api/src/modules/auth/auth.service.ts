import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  type AuthMessageResponse,
  type AuthTokens,
  type ConfirmEmailDto,
  type ForgotPasswordDto,
  type LoginDto,
  type RefreshTokenDto,
  type RegisterDto,
  type ResetPasswordDto,
  type UserProfile,
  AuthOtpPurpose,
  UserRole,
} from '@postgres-web-manager/contracts';
import { getEnv } from '../../config/env.config';
import { INTERNAL_DATA_SOURCE } from '../../database/database.module';
import {
  AuthEmailOtpEntity,
  AuthRefreshTokenEntity,
  UserEntity,
  WorkspaceEntity,
} from '../../database/entities';
import { ResendMailService } from '../../mail/resend-mail.service';

type MockUser = UserProfile & { passwordHash: string };
type UserRecord = UserProfile & { passwordHash: string };
type MockOtpRecord = {
  userId: string | null;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
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
    emailVerified: true,
    passwordHash: DEV_PASSWORD_HASH,
  },
  {
    id: DEVELOPER_USER_ID,
    email: 'dev@pgstudio.local',
    name: 'Developer',
    role: UserRole.DEVELOPER,
    workspaceId: DEV_WORKSPACE_ID,
    emailVerified: true,
    passwordHash: DEV_PASSWORD_HASH,
  },
];

const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days
const PASSWORD_HASH_ITERATIONS = 310_000;
const OTP_TTL = 60 * 10; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Used only when no internal database is configured.
  private readonly refreshTokens = new Set<string>();
  private readonly otpRecords = new Map<string, MockOtpRecord>();

  constructor(
    @Inject(INTERNAL_DATA_SOURCE)
    private readonly dataSource: DataSource | null,
    private readonly mailService: ResendMailService,
  ) {}

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
    const user = await this.findUserByEmail(this.normalizeEmail(dto.email));
    if (!user || !this.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerified) {
      throw new ForbiddenException('Email confirmation required');
    }

    const tokens = this.generateTokens(user);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`User logged in: ${user.email}`);
    return { user: this.toUserProfile(user), tokens };
  }

  async register(dto: RegisterDto): Promise<AuthMessageResponse> {
    const email = this.normalizeEmail(dto.email);
    this.assertValidEmail(email);
    this.assertValidPassword(dto.password);

    const name = this.normalizeOptionalText(dto.name) ?? email;
    const workspaceName =
      this.normalizeOptionalText(dto.workspaceName) ?? `${name}'s Workspace`;

    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    let userId: string;
    if (!this.dataSource) {
      userId = uuidv4();
      MOCK_USERS.push({
        id: userId,
        email,
        name,
        role: UserRole.OWNER,
        workspaceId: uuidv4(),
        emailVerified: false,
        passwordHash: this.hashPassword(dto.password),
      });
    } else {
      userId = await this.dataSource.transaction(async (manager) => {
        const workspaceId = await this.createWorkspace(manager, workspaceName);
        const user = manager.create(UserEntity, {
          workspaceId,
          email,
          displayName: name,
          role: UserRole.OWNER,
          passwordHash: this.hashPassword(dto.password),
          emailVerifiedAt: null,
        });
        return (await manager.save(user)).id;
      });
    }

    return this.issueOtp(email, AuthOtpPurpose.EMAIL_CONFIRMATION, userId);
  }

  async confirmEmail(dto: ConfirmEmailDto): Promise<AuthMessageResponse> {
    const email = this.normalizeEmail(dto.email);
    const userId = await this.consumeOtp(
      email,
      AuthOtpPurpose.EMAIL_CONFIRMATION,
      dto.otp,
    );
    if (!userId) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (!this.dataSource) {
      const user = MOCK_USERS.find((u) => u.id === userId);
      if (user) {
        user.emailVerified = true;
      }
    } else {
      await this.dataSource
        .getRepository(UserEntity)
        .createQueryBuilder()
        .update(UserEntity)
        .set({ emailVerifiedAt: () => 'COALESCE(email_verified_at, NOW())' })
        .where('id = :userId', { userId })
        .andWhere('lower(email) = lower(:email)', { email })
        .execute();
    }

    return {
      success: true,
      message: 'Email confirmed successfully',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<AuthMessageResponse> {
    const email = this.normalizeEmail(dto.email);
    this.assertValidEmail(email);

    const user = await this.findUserByEmail(email);
    if (!user || !user.emailVerified) {
      return {
        success: true,
        message: 'If the email exists, a reset code has been sent',
        expiresIn: OTP_TTL,
      };
    }

    const response = await this.issueOtp(
      email,
      AuthOtpPurpose.PASSWORD_RESET,
      user.id,
    );
    return {
      ...response,
      message: 'If the email exists, a reset code has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<AuthMessageResponse> {
    const email = this.normalizeEmail(dto.email);
    this.assertValidEmail(email);
    this.assertValidPassword(dto.password);

    const userId = await this.consumeOtp(
      email,
      AuthOtpPurpose.PASSWORD_RESET,
      dto.otp,
    );
    if (!userId) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    const passwordHash = this.hashPassword(dto.password);

    if (!this.dataSource) {
      const user = MOCK_USERS.find((u) => u.id === userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      user.passwordHash = passwordHash;
      this.refreshTokens.clear();
    } else {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .createQueryBuilder()
          .update(UserEntity)
          .set({ passwordHash })
          .where('id = :userId', { userId })
          .andWhere('lower(email) = lower(:email)', { email })
          .execute();
        await manager
          .createQueryBuilder()
          .update(AuthRefreshTokenEntity)
          .set({ revokedAt: () => 'COALESCE(revoked_at, NOW())' })
          .where('user_id = :userId', { userId })
          .execute();
      });
    }

    return {
      success: true,
      message: 'Password reset successfully',
    };
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
    if (!this.dataSource) {
      return MOCK_USERS.find(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
      );
    }

    const user = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();
    return user ? this.toUserRecord(user) : undefined;
  }

  private async findUserById(id: string): Promise<UserRecord | undefined> {
    if (!this.dataSource) {
      return MOCK_USERS.find((u) => u.id === id);
    }

    const user = await this.dataSource.getRepository(UserEntity).findOneBy({
      id,
    });
    return user ? this.toUserRecord(user) : undefined;
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

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('base64url');
    const hash = pbkdf2Sync(
      password,
      salt,
      PASSWORD_HASH_ITERATIONS,
      32,
      'sha256',
    ).toString('base64url');
    return `pbkdf2-sha256$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
  }

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    if (!this.dataSource) {
      this.refreshTokens.add(refreshToken);
      return;
    }

    await this.dataSource.getRepository(AuthRefreshTokenEntity).insert({
      userId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
      revokedAt: null,
    });
  }

  private async rotateRefreshToken(
    oldToken: string,
    newToken: string,
  ): Promise<boolean> {
    if (!this.dataSource) {
      if (!this.refreshTokens.has(oldToken)) {
        return false;
      }
      this.refreshTokens.delete(oldToken);
      this.refreshTokens.add(newToken);
      return true;
    }

    const result = await this.dataSource
      .getRepository(AuthRefreshTokenEntity)
      .createQueryBuilder()
      .update(AuthRefreshTokenEntity)
      .set({ revokedAt: new Date() })
      .where('token_hash = :tokenHash', { tokenHash: this.hashToken(oldToken) })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > :now', { now: new Date() })
      .execute();
    return result.affected === 1;
  }

  private async revokeRefreshToken(refreshToken: string): Promise<void> {
    if (!this.dataSource) {
      this.refreshTokens.delete(refreshToken);
      return;
    }

    await this.dataSource
      .getRepository(AuthRefreshTokenEntity)
      .createQueryBuilder()
      .update(AuthRefreshTokenEntity)
      .set({ revokedAt: () => 'COALESCE(revoked_at, NOW())' })
      .where('token_hash = :tokenHash', {
        tokenHash: this.hashToken(refreshToken),
      })
      .execute();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createWorkspace(
    manager: EntityManager,
    workspaceName: string,
  ): Promise<string> {
    const slug = `${this.slugify(workspaceName)}-${uuidv4().slice(0, 8)}`;
    const workspace = manager.create(WorkspaceEntity, {
      name: workspaceName,
      slug,
    });
    return (await manager.save(workspace)).id;
  }

  private async issueOtp(
    email: string,
    purpose: AuthOtpPurpose,
    userId: string | null,
  ): Promise<AuthMessageResponse> {
    const otp = this.generateOtp();
    const codeHash = this.hashOtp(email, purpose, otp);

    if (!this.dataSource) {
      this.otpRecords.set(this.otpKey(email, purpose), {
        userId,
        codeHash,
        expiresAt: Date.now() + OTP_TTL * 1000,
        attempts: 0,
        consumed: false,
      });
    } else {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .createQueryBuilder()
          .update(AuthEmailOtpEntity)
          .set({ consumedAt: () => 'COALESCE(consumed_at, NOW())' })
          .where('lower(email) = lower(:email)', { email })
          .andWhere('purpose = :purpose', { purpose })
          .andWhere('consumed_at IS NULL')
          .execute();
        await manager.getRepository(AuthEmailOtpEntity).insert({
          userId,
          email,
          purpose,
          codeHash,
          attempts: 0,
          expiresAt: new Date(Date.now() + OTP_TTL * 1000),
          consumedAt: null,
        });
      });
    }

    await this.mailService.sendOtpEmail({
      to: email,
      otp,
      purpose,
      expiresInSeconds: OTP_TTL,
    });

    if (getEnv().NODE_ENV !== 'production') {
      this.logger.log(`OTP ${purpose} for ${email}: ${otp}`);
      return {
        success: true,
        message: 'Verification code sent',
        expiresIn: OTP_TTL,
        devOtp: otp,
      };
    }

    this.logger.log(`OTP ${purpose} issued for ${email}`);
    return {
      success: true,
      message: 'Verification code sent',
      expiresIn: OTP_TTL,
    };
  }

  private async consumeOtp(
    email: string,
    purpose: AuthOtpPurpose,
    otp: string,
  ): Promise<string | null> {
    const cleanOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (!this.dataSource) {
      return this.consumeMockOtp(email, purpose, cleanOtp);
    }

    const otpRepository = this.dataSource.getRepository(AuthEmailOtpEntity);
    const record = await otpRepository
      .createQueryBuilder('otp')
      .where('lower(otp.email) = lower(:email)', { email })
      .andWhere('otp.purpose = :purpose', { purpose })
      .andWhere('otp.consumed_at IS NULL')
      .orderBy('otp.created_at', 'DESC')
      .getOne();
    if (!record) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (
      record.expiresAt.getTime() <= Date.now() ||
      record.attempts >= OTP_MAX_ATTEMPTS
    ) {
      await otpRepository.update(record.id, { consumedAt: new Date() });
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (
      !this.matchesHash(this.hashOtp(email, purpose, cleanOtp), record.codeHash)
    ) {
      await otpRepository.increment({ id: record.id }, 'attempts', 1);
      throw new BadRequestException('Invalid or expired verification code');
    }

    await otpRepository.update(record.id, { consumedAt: new Date() });
    return record.userId;
  }

  private consumeMockOtp(
    email: string,
    purpose: AuthOtpPurpose,
    otp: string,
  ): string | null {
    const key = this.otpKey(email, purpose);
    const record = this.otpRecords.get(key);
    if (!record || record.consumed || record.expiresAt <= Date.now()) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      record.consumed = true;
      throw new BadRequestException('Invalid or expired verification code');
    }
    if (!this.matchesHash(this.hashOtp(email, purpose, otp), record.codeHash)) {
      record.attempts += 1;
      throw new BadRequestException('Invalid or expired verification code');
    }
    record.consumed = true;
    return record.userId;
  }

  private hashOtp(email: string, purpose: AuthOtpPurpose, otp: string): string {
    return createHmac('sha256', this.jwtSecret)
      .update(`${purpose}:${this.normalizeEmail(email)}:${otp}`)
      .digest('hex');
  }

  private matchesHash(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private otpKey(email: string, purpose: AuthOtpPurpose): string {
    return `${purpose}:${this.normalizeEmail(email)}`;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, 255) : undefined;
  }

  private assertValidEmail(email: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }
  }

  private assertValidPassword(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
  }

  private slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return slug || 'workspace';
  }

  private toUserRecord(user: UserEntity): UserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.displayName ?? user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      emailVerified: user.emailVerifiedAt !== null,
      passwordHash: user.passwordHash,
    };
  }

  private toUserProfile(user: UserRecord): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: user.workspaceId,
      emailVerified: user.emailVerified,
    };
  }
}
