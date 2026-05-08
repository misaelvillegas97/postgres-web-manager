import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, FindOptionsWhere } from 'typeorm';
import {
  ConnectionProfile,
  ConnectionStatus,
  CreateConnectionDto,
  TestConnectionDto,
  TestConnectionResult,
} from '@postgres-web-manager/contracts';
import { INTERNAL_DATA_SOURCE } from '../../database/database.module';
import {
  ConnectionAccessMode,
  ConnectionProfileEntity,
  ConnectionSslMode,
} from '../../database/entities';
import { CredentialsEncryptionService } from '../../crypto/credentials-encryption.service';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { SessionRegistryService } from '../sessions/session-registry.service';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  // Temporary in-memory password store for unlocked connections (session-scoped)
  private readonly unlockedPasswords = new Map<string, string>();
  private readonly invalidAutoUnlocks = new Set<string>();

  constructor(
    @Inject(INTERNAL_DATA_SOURCE)
    private readonly dataSource: DataSource | null,
    private readonly encryption: CredentialsEncryptionService,
    private readonly poolManager: PostgresPoolManager,
    private readonly sessionRegistry: SessionRegistryService,
  ) {}

  async findAll(workspaceId?: string): Promise<ConnectionProfile[]> {
    if (!this.dataSource) return [];
    const query = this.dataSource
      .getRepository(ConnectionProfileEntity)
      .createQueryBuilder('profile')
      .orderBy('profile.name', 'ASC');
    if (workspaceId) {
      query.where('profile.workspace_id = :workspaceId', { workspaceId });
    }
    return (await query.getMany()).map((profile) => this.toProfile(profile));
  }

  async findOne(id: string, workspaceId?: string): Promise<ConnectionProfile> {
    const profile = await this.findOneEntity(id, workspaceId);
    return this.toProfile(profile);
  }

  async create(
    dto: CreateConnectionDto,
    workspaceId?: string,
  ): Promise<ConnectionProfile> {
    if (!this.dataSource) throw new Error('Internal database not configured');
    const scopedWorkspaceId = this.requireWorkspaceId(workspaceId);

    let passwordEncrypted: string | null = null;
    if (dto.savePassword && dto.password) {
      passwordEncrypted = this.encryption.encrypt(dto.password);
    }

    const repository = this.dataSource.getRepository(ConnectionProfileEntity);
    const profile = repository.create({
      workspaceId: scopedWorkspaceId,
      name: dto.name,
      host: dto.host,
      port: dto.port ?? 5432,
      database: dto.database,
      username: dto.username,
      passwordEncrypted,
      sslMode: (dto.sslMode ?? 'prefer') as ConnectionSslMode,
      accessMode: (dto.accessMode ?? 'read-write') as ConnectionAccessMode,
      maxRows: dto.maxRows ?? 1000,
      statementTimeoutMs: dto.statementTimeoutMs ?? 30000,
      savePassword: dto.savePassword ?? false,
      color: null,
      notes: null,
    });
    const savedProfile = await repository.save(profile);

    this.logger.log(
      `Connection created: ${dto.name} (${dto.host}) workspace=${scopedWorkspaceId}`,
    );
    return this.toProfile(savedProfile);
  }

  async update(
    id: string,
    dto: Partial<CreateConnectionDto>,
    workspaceId?: string,
  ): Promise<ConnectionProfile> {
    if (!this.dataSource) throw new Error('Internal database not configured');
    const scopedWorkspaceId = this.requireWorkspaceId(workspaceId);
    const repository = this.dataSource.getRepository(ConnectionProfileEntity);
    const profile = await repository.findOne({
      where: { id, workspaceId: scopedWorkspaceId },
    });
    if (!profile) throw new NotFoundException(`Connection ${id} not found`);

    let changed = false;
    const assign = <Key extends keyof ConnectionProfileEntity>(
      key: Key,
      value: ConnectionProfileEntity[Key] | undefined,
    ) => {
      if (value !== undefined) {
        profile[key] = value;
        changed = true;
      }
    };

    assign('name', dto.name);
    assign('host', dto.host);
    assign('port', dto.port);
    assign('database', dto.database);
    assign('username', dto.username);
    assign('sslMode', dto.sslMode as ConnectionSslMode | undefined);
    assign('accessMode', dto.accessMode as ConnectionAccessMode | undefined);
    assign('maxRows', dto.maxRows);
    assign('statementTimeoutMs', dto.statementTimeoutMs);
    assign('savePassword', dto.savePassword);

    if ('password' in dto && dto.password !== undefined) {
      if (dto.savePassword !== false) {
        profile.passwordEncrypted = this.encryption.encrypt(dto.password);
      } else {
        profile.passwordEncrypted = null;
      }
      changed = true;
    }

    if (!changed) return this.toProfile(profile);
    return this.toProfile(await repository.save(profile));
  }

  async remove(id: string, workspaceId?: string): Promise<void> {
    if (!this.dataSource) throw new Error('Internal database not configured');
    const where: FindOptionsWhere<ConnectionProfileEntity> = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const result = await this.dataSource
      .getRepository(ConnectionProfileEntity)
      .delete(where);
    if (result.affected === 0)
      throw new NotFoundException(`Connection ${id} not found`);

    // Clean up pool if it exists
    if (this.poolManager.hasPool(id)) {
      await this.poolManager.destroyPool(id);
    }
    this.unlockedPasswords.delete(id);
  }

  async test(dto: TestConnectionDto): Promise<TestConnectionResult> {
    const start = Date.now();
    const testPoolId = `__test__:${randomUUID()}`;
    try {
      await this.poolManager.createPool(testPoolId, {
        host: dto.host,
        port: dto.port,
        database: dto.database,
        username: dto.username,
        password: dto.password,
        sslMode: dto.sslMode,
        statementTimeoutMs: 5000,
      });

      const client = await this.poolManager.getClient(testPoolId);
      let serverVersion: string | undefined;
      try {
        const result = await client.query('SELECT version()');
        serverVersion = result.rows[0]?.['version'] as string | undefined;
      } finally {
        client.release();
      }

      await this.poolManager.destroyPool(testPoolId);

      return {
        success: true,
        serverVersion,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      await this.poolManager.destroyPool(testPoolId).catch(() => undefined);
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async status(id: string, workspaceId?: string): Promise<ConnectionStatus> {
    const profile = await this.findOne(id, workspaceId);
    const checkedAt = new Date().toISOString();

    if (!this.poolManager.hasPool(id)) {
      return {
        connectionId: id,
        state: 'locked',
        active: false,
        canAutoUnlock: this.canAutoUnlock(id, profile),
        checkedAt,
        message: 'Connection is not unlocked in this gateway process.',
      };
    }

    let client;
    try {
      client = await this.poolManager.getClient(id);
      await client.query('SELECT 1');
      return {
        connectionId: id,
        state: 'active',
        active: true,
        canAutoUnlock: this.canAutoUnlock(id, profile),
        checkedAt,
        pool: this.poolManager.getPoolStats(id),
      };
    } catch (err) {
      if (this.isPasswordAuthenticationError(err)) {
        this.unlockedPasswords.delete(id);
        this.invalidAutoUnlocks.add(id);
        await this.poolManager.destroyPool(id).catch(() => undefined);
      }

      return {
        connectionId: id,
        state: 'unhealthy',
        active: false,
        canAutoUnlock: this.canAutoUnlock(id, profile),
        checkedAt,
        message: err instanceof Error ? err.message : String(err),
        pool: this.poolManager.getPoolStats(id),
      };
    } finally {
      client?.release();
    }
  }

  async unlock(
    id: string,
    password?: string,
    workspaceId?: string,
  ): Promise<{ unlocked: boolean }> {
    const profile = await this.findOneWithPassword(id, workspaceId);
    const memoryPassword = this.unlockedPasswords.get(id);
    const savedPassword =
      profile.password && !this.invalidAutoUnlocks.has(id)
        ? profile.password
        : undefined;
    const resolvedPassword = password ?? memoryPassword ?? savedPassword;

    if (this.sessionRegistry.hasActiveConnection(id)) {
      throw new ConflictException(
        'This database connection is already open in another browser or device. Close that session before opening it here.',
      );
    }

    if (this.poolManager.hasPool(id) && password === undefined) {
      try {
        await this.verifyPool(id);
        this.invalidAutoUnlocks.delete(id);
        return { unlocked: true };
      } catch (err) {
        this.unlockedPasswords.delete(id);
        if (this.isPasswordAuthenticationError(err)) {
          this.invalidAutoUnlocks.add(id);
        }
        await this.poolManager.destroyPool(id).catch(() => undefined);
        throw new BadRequestException(
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (resolvedPassword === undefined) {
      throw new BadRequestException(
        'Password is required to unlock this connection',
      );
    }

    try {
      await this.poolManager.createPool(id, {
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: resolvedPassword,
        sslMode: profile.sslMode as Parameters<
          typeof this.poolManager.createPool
        >[1]['sslMode'],
        statementTimeoutMs: profile.statementTimeoutMs,
        maxRows: profile.maxRows,
        accessMode: profile.accessMode as 'read-only' | 'read-write',
      });
      await this.verifyPool(id);
    } catch (err) {
      this.unlockedPasswords.delete(id);
      if (this.isPasswordAuthenticationError(err)) {
        this.invalidAutoUnlocks.add(id);
      }
      await this.poolManager.destroyPool(id).catch(() => undefined);
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    this.invalidAutoUnlocks.delete(id);
    this.unlockedPasswords.set(id, resolvedPassword);
    this.logger.log(`Connection ${id} unlocked and pool created`);
    return { unlocked: true };
  }

  /** Returns the decrypted password for a connection if available. */
  getPassword(connectionId: string): string | undefined {
    // Check in-memory unlocked first
    const unlocked = this.unlockedPasswords.get(connectionId);
    if (unlocked) return unlocked;
    return undefined;
  }

  private async findOneWithPassword(
    id: string,
    workspaceId?: string,
  ): Promise<ConnectionProfile & { password?: string }> {
    const profileEntity = await this.findOneEntity(id, workspaceId);
    const profile = this.toProfile(profileEntity);
    let password: string | undefined;
    if (profileEntity.passwordEncrypted && this.encryption.isAvailable()) {
      try {
        password = this.encryption.decrypt(profileEntity.passwordEncrypted);
      } catch {
        this.logger.warn(`Failed to decrypt password for connection ${id}`);
      }
    }
    return { ...profile, password };
  }

  private async findOneEntity(
    id: string,
    workspaceId?: string,
  ): Promise<ConnectionProfileEntity> {
    if (!this.dataSource)
      throw new NotFoundException(`Connection ${id} not found`);
    const where: FindOptionsWhere<ConnectionProfileEntity> = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const profile = await this.dataSource
      .getRepository(ConnectionProfileEntity)
      .findOne({ where });
    if (!profile) throw new NotFoundException(`Connection ${id} not found`);
    return profile;
  }

  private requireWorkspaceId(workspaceId?: string): string {
    if (!workspaceId) {
      throw new BadRequestException('Authenticated workspace is required');
    }
    return workspaceId;
  }

  private async verifyPool(connectionId: string): Promise<void> {
    const client = await this.poolManager.getClient(connectionId);
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  private canAutoUnlock(
    connectionId: string,
    profile: Pick<ConnectionProfile, 'savePassword'>,
  ): boolean {
    if (this.invalidAutoUnlocks.has(connectionId)) return false;
    return profile.savePassword || this.unlockedPasswords.has(connectionId);
  }

  private isPasswordAuthenticationError(err: unknown): boolean {
    const maybePgError = err as { code?: unknown; message?: unknown };
    const message =
      typeof maybePgError.message === 'string' ? maybePgError.message : '';
    return (
      maybePgError.code === '28P01' ||
      message.includes('password authentication failed')
    );
  }

  private toProfile(row: ConnectionProfileEntity): ConnectionProfile {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      host: row.host,
      port: row.port,
      database: row.database,
      username: row.username,
      sslMode: row.sslMode,
      accessMode: row.accessMode,
      maxRows: row.maxRows,
      statementTimeoutMs: row.statementTimeoutMs,
      savePassword: row.savePassword,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
