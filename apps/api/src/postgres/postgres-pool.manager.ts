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
}

@Injectable()
export class PostgresPoolManager implements OnModuleDestroy {
  private readonly logger = new Logger(PostgresPoolManager.name);
  private readonly pools = new Map<string, Pool>();

  getPool(connectionId: string): Pool {
    const pool = this.pools.get(connectionId);
    if (!pool) {
      throw new Error(`No pool found for connection ID: ${connectionId}`);
    }
    return pool;
  }

  async getClient(connectionId: string): Promise<PoolClient> {
    const pool = this.getPool(connectionId);
    return pool.connect();
  }

  async createPool(connectionId: string, config: PoolConnectionConfig): Promise<void> {
    if (this.pools.has(connectionId)) {
      await this.destroyPool(connectionId);
    }

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
    this.logger.log(`Pool created for connection: ${connectionId}`);
  }

  async destroyPool(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId);
    if (pool) {
      await pool.end();
      this.pools.delete(connectionId);
      this.logger.log(`Pool destroyed for connection: ${connectionId}`);
    }
  }

  hasPool(connectionId: string): boolean {
    return this.pools.has(connectionId);
  }

  async onModuleDestroy(): Promise<void> {
    const ids = Array.from(this.pools.keys());
    await Promise.all(ids.map((id) => this.destroyPool(id)));
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
