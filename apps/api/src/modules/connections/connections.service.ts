import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import {
  ConnectionProfile,
  ConnectionStatus,
  CreateConnectionDto,
  TestConnectionDto,
  TestConnectionResult,
} from '@postgres-web-manager/contracts';
import { INTERNAL_DB_POOL } from '../../database/database.module';
import { CredentialsEncryptionService } from '../../crypto/credentials-encryption.service';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { SessionRegistryService } from '../sessions/session-registry.service';

type DbRow = Record<string, unknown>;

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  // Temporary in-memory password store for unlocked connections (session-scoped)
  private readonly unlockedPasswords = new Map<string, string>();
  private readonly invalidAutoUnlocks = new Set<string>();

  constructor(
    @Inject(INTERNAL_DB_POOL) private readonly db: Pool | null,
    private readonly encryption: CredentialsEncryptionService,
    private readonly poolManager: PostgresPoolManager,
    private readonly sessionRegistry: SessionRegistryService,
  ) {}

  async findAll(workspaceId?: string): Promise<ConnectionProfile[]> {
    if (!this.db) return [];
    const { rows } = await this.db.query<DbRow>(
      `SELECT id, workspace_id, name, host, port, database, username,
              ssl_mode, access_mode, max_rows, statement_timeout_ms,
              save_password, created_at, updated_at
       FROM connection_profiles
       WHERE ($1::uuid IS NULL OR workspace_id = $1)
       ORDER BY name ASC`,
      [workspaceId ?? null],
    );
    return rows.map(this.toProfile);
  }

  async findOne(id: string, workspaceId?: string): Promise<ConnectionProfile> {
    if (!this.db) throw new NotFoundException(`Connection ${id} not found`);
    const { rows } = await this.db.query<DbRow>(
      `SELECT id, workspace_id, name, host, port, database, username,
              ssl_mode, access_mode, max_rows, statement_timeout_ms,
              save_password, created_at, updated_at
       FROM connection_profiles
       WHERE id = $1 AND ($2::uuid IS NULL OR workspace_id = $2)`,
      [id, workspaceId ?? null],
    );
    if (rows.length === 0)
      throw new NotFoundException(`Connection ${id} not found`);
    return this.toProfile(rows[0]);
  }

  async create(
    dto: CreateConnectionDto,
    workspaceId?: string,
  ): Promise<ConnectionProfile> {
    if (!this.db) throw new Error('Internal database not configured');
    const scopedWorkspaceId = this.requireWorkspaceId(workspaceId);

    let passwordEncrypted: string | null = null;
    if (dto.savePassword && dto.password) {
      passwordEncrypted = this.encryption.encrypt(dto.password);
    }

    const { rows } = await this.db.query<DbRow>(
      `INSERT INTO connection_profiles
         (workspace_id, name, host, port, database, username, password_encrypted,
          ssl_mode, access_mode, max_rows, statement_timeout_ms, save_password)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, workspace_id, name, host, port, database, username,
                 ssl_mode, access_mode, max_rows, statement_timeout_ms,
                 save_password, created_at, updated_at`,
      [
        scopedWorkspaceId,
        dto.name,
        dto.host,
        dto.port ?? 5432,
        dto.database,
        dto.username,
        passwordEncrypted,
        dto.sslMode ?? 'prefer',
        dto.accessMode ?? 'read-write',
        dto.maxRows ?? 1000,
        dto.statementTimeoutMs ?? 30000,
        dto.savePassword ?? false,
      ],
    );

    this.logger.log(
      `Connection created: ${dto.name} (${dto.host}) workspace=${scopedWorkspaceId}`,
    );
    return this.toProfile(rows[0]);
  }

  async update(
    id: string,
    dto: Partial<CreateConnectionDto>,
    workspaceId?: string,
  ): Promise<ConnectionProfile> {
    if (!this.db) throw new Error('Internal database not configured');
    const scopedWorkspaceId = this.requireWorkspaceId(workspaceId);

    // Build dynamic SET clause from provided fields
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      host: 'host',
      port: 'port',
      database: 'database',
      username: 'username',
      sslMode: 'ssl_mode',
      accessMode: 'access_mode',
      maxRows: 'max_rows',
      statementTimeoutMs: 'statement_timeout_ms',
      savePassword: 'save_password',
    };

    for (const [dtoKey, dbCol] of Object.entries(fieldMap)) {
      if (dtoKey in dto) {
        updates.push(`${dbCol} = $${idx++}`);
        values.push((dto as Record<string, unknown>)[dtoKey]);
      }
    }

    // Handle password separately
    if ('password' in dto && dto.password !== undefined) {
      if (dto.savePassword !== false) {
        updates.push(`password_encrypted = $${idx++}`);
        values.push(this.encryption.encrypt(dto.password));
      } else {
        updates.push(`password_encrypted = NULL`);
      }
    }

    if (updates.length === 0) return this.findOne(id, scopedWorkspaceId);

    updates.push(`updated_at = NOW()`);
    values.push(id);
    values.push(scopedWorkspaceId);

    const { rows } = await this.db.query<DbRow>(
      `UPDATE connection_profiles SET ${updates.join(', ')}
       WHERE id = $${idx} AND workspace_id = $${idx + 1}
       RETURNING id, workspace_id, name, host, port, database, username,
                 ssl_mode, access_mode, max_rows, statement_timeout_ms,
                 save_password, created_at, updated_at`,
      values,
    );

    if (rows.length === 0)
      throw new NotFoundException(`Connection ${id} not found`);
    return this.toProfile(rows[0]);
  }

  async remove(id: string, workspaceId?: string): Promise<void> {
    if (!this.db) throw new Error('Internal database not configured');
    const { rowCount } = await this.db.query(
      'DELETE FROM connection_profiles WHERE id = $1 AND ($2::uuid IS NULL OR workspace_id = $2)',
      [id, workspaceId ?? null],
    );
    if (rowCount === 0)
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
    if (!this.db) throw new NotFoundException(`Connection ${id} not found`);
    const { rows } = await this.db.query<DbRow>(
      `SELECT id, workspace_id, name, host, port, database, username,
              password_encrypted, ssl_mode, access_mode, max_rows,
              statement_timeout_ms, save_password, created_at, updated_at
       FROM connection_profiles
       WHERE id = $1 AND ($2::uuid IS NULL OR workspace_id = $2)`,
      [id, workspaceId ?? null],
    );
    if (rows.length === 0)
      throw new NotFoundException(`Connection ${id} not found`);

    const profile = this.toProfile(rows[0]);
    let password: string | undefined;
    if (rows[0]['password_encrypted'] && this.encryption.isAvailable()) {
      try {
        password = this.encryption.decrypt(
          rows[0]['password_encrypted'] as string,
        );
      } catch {
        this.logger.warn(`Failed to decrypt password for connection ${id}`);
      }
    }
    return { ...profile, password };
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

  private toProfile(row: DbRow): ConnectionProfile {
    return {
      id: row['id'] as string,
      workspaceId: (row['workspace_id'] as string) ?? '',
      name: row['name'] as string,
      host: row['host'] as string,
      port: row['port'] as number,
      database: row['database'] as string,
      username: row['username'] as string,
      sslMode: row['ssl_mode'] as ConnectionProfile['sslMode'],
      accessMode: row['access_mode'] as ConnectionProfile['accessMode'],
      maxRows: row['max_rows'] as number,
      statementTimeoutMs: row['statement_timeout_ms'] as number,
      savePassword: Boolean(row['save_password']),
      createdAt: (row['created_at'] as Date).toISOString(),
      updatedAt: (row['updated_at'] as Date).toISOString(),
    };
  }
}
