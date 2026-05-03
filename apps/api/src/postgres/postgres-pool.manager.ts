import { Injectable, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class PostgresPoolManager implements OnModuleDestroy {
  private readonly pools = new Map<string, unknown>();

  getPool(_connectionId: string): unknown {
    return this.pools.get(_connectionId);
  }

  async createPool(_connectionId: string, _config: unknown): Promise<void> {
    throw new Error('Not implemented');
  }

  async destroyPool(_connectionId: string): Promise<void> {
    const pool = this.pools.get(_connectionId);
    if (pool) {
      this.pools.delete(_connectionId);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const ids = Array.from(this.pools.keys());
    await Promise.all(ids.map((id) => this.destroyPool(id)));
  }
}
