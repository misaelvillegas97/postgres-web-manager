import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { getEnv } from '../config/env.config';
import { DatabaseMigrationService } from './database-migration.service';

const INTERNAL_DB_POOL = 'INTERNAL_DB_POOL';

@Global()
@Module({
  providers: [
    {
      provide: INTERNAL_DB_POOL,
      useFactory: () => {
        const env = getEnv();
        if (!env.DATABASE_URL) {
          // In development without DATABASE_URL, return a placeholder
          // Services that need the DB will fail fast when they try to query
          return null;
        }
        return new Pool({
          connectionString: env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
      },
    },
    {
      provide: DatabaseMigrationService,
      useFactory: (pool: Pool | null) => {
        if (!pool) {
          return {
            onModuleInit: () => {
              /* skip migrations when no internal DB is configured */
            },
          };
        }
        return new DatabaseMigrationService(pool);
      },
      inject: [INTERNAL_DB_POOL],
    },
  ],
  exports: [INTERNAL_DB_POOL, DatabaseMigrationService],
})
export class DatabaseModule {}

export { INTERNAL_DB_POOL };
