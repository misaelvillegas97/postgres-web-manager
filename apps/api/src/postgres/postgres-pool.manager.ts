import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, PoolConfig } from 'pg';

export interface PoolConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode?: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  statementTimeoutMs?: number;
  maxRows?: number;
  accessMode?: 'read-only' | 'read-write';
}

@Injectable()
export class PostgresPoolManager implements OnModuleDestroy {
  private readonly logger = new Logger(PostgresPoolManager.name);
  private readonly pools = new Map<string, Pool>();
  private readonly accessModes = new Map<string, 'read-only' | 'read-write'>();
  private readonly poolOperations = new Map<string, Promise<unknown>>();

  getPool(connectionId: string): Pool | undefined {
    return this.pools.get(connectionId);
  }

  getPoolStats(
    connectionId: string,
  ):
    | { totalCount: number; idleCount: number; waitingCount: number }
    | undefined {
    const pool = this.getPool(connectionId);
    if (!pool) return undefined;
    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  }

  async getClient(connectionId: string): Promise<PoolClient> {
    const pool = this.getPool(connectionId);
    if (!pool) {
      throw new Error(`No pool found for connection ID: ${connectionId}`);
    }
    return pool.connect();
  }

  async createPool(
    connectionId: string,
    config: PoolConnectionConfig,
  ): Promise<void> {
    await this.runPoolOperation(connectionId, async () => {
      await this.destroyPoolNow(connectionId);

      const ssl = this.resolveSsl(config.sslMode);
      const poolConfig: PoolConfig = {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl,
        statement_timeout: config.statementTimeoutMs ?? 30000,
        max: 10,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 10000,
      };

      const pool = new Pool(poolConfig);
      this.pools.set(connectionId, pool);
      this.accessModes.set(connectionId, config.accessMode ?? 'read-write');
      this.logger.log(`Pool created for connection: ${connectionId}`);
    });
  }

  async destroyPool(connectionId: string): Promise<void> {
    await this.runPoolOperation(connectionId, () =>
      this.destroyPoolNow(connectionId),
    );
  }

  private async destroyPoolNow(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId);
    if (pool) {
      this.pools.delete(connectionId);
      this.accessModes.delete(connectionId);
      await pool.end();
      this.logger.log(`Pool destroyed for connection: ${connectionId}`);
    }
  }

  hasPool(connectionId: string): boolean {
    return this.pools.has(connectionId);
  }

  getAccessMode(connectionId: string): 'read-only' | 'read-write' {
    return this.accessModes.get(connectionId) ?? 'read-write';
  }

  async onModuleDestroy(): Promise<void> {
    const ids = Array.from(this.pools.keys());
    await Promise.all(ids.map((id) => this.destroyPool(id)));
  }

  private runPoolOperation<T>(
    connectionId: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    const previous = this.poolOperations.get(connectionId) ?? Promise.resolve();
    const current = (async () => {
      await previous.catch(() => undefined);
      return operation();
    })();
    const cleanup = current.finally(() => {
      if (this.poolOperations.get(connectionId) === cleanup) {
        this.poolOperations.delete(connectionId);
      }
    });
    this.poolOperations.set(connectionId, cleanup);
    return current;
  }

  private resolveSsl(
    sslMode?: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full',
  ): boolean | { rejectUnauthorized: boolean } | undefined {
    switch (sslMode) {
      case 'disable':
        return false;
      case 'require':
        return { rejectUnauthorized: false };
      case 'verify-ca':
      case 'verify-full':
        return { rejectUnauthorized: true };
      case 'prefer':
      default:
        return undefined;
    }
  }
}
