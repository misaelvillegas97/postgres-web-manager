import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { INTERNAL_DB_POOL } from '../database/database.module';
import { Public } from '../decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    @Inject(INTERNAL_DB_POOL) private readonly db: Pool | null,
  ) {}

  @Public()
  @Get('health')
  async health() {
    const timestamp = new Date().toISOString();
    if (!this.db) {
      return { status: 'ok', timestamp, database: 'unconfigured' };
    }

    try {
      const client = await this.db.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      return { status: 'ok', timestamp, database: 'connected' };
    } catch {
      return { status: 'degraded', timestamp, database: 'unreachable' };
    }
  }
}
