import { Controller, Get, Inject } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { INTERNAL_DATA_SOURCE } from '../database/database.module';
import { Public } from '../decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    @Inject(INTERNAL_DATA_SOURCE)
    private readonly dataSource: DataSource | null,
  ) {}

  @Public()
  @Get('health')
  async health() {
    const timestamp = new Date().toISOString();
    if (!this.dataSource) {
      return { status: 'ok', timestamp, database: 'unconfigured' };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', timestamp, database: 'connected' };
    } catch {
      return { status: 'degraded', timestamp, database: 'unreachable' };
    }
  }
}
