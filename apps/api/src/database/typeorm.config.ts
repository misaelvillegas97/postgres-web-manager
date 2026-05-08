import type { DataSourceOptions } from 'typeorm';
import { INTERNAL_DATABASE_ENTITIES } from './entities';
import { INTERNAL_DATABASE_MIGRATIONS } from './migrations';

export function createInternalDataSourceOptions(
  databaseUrl: string,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: INTERNAL_DATABASE_ENTITIES,
    migrations: INTERNAL_DATABASE_MIGRATIONS,
    migrationsTableName: '_typeorm_migrations',
    migrationsTransactionMode: 'each',
    synchronize: false,
    logging: ['error', 'warn'],
    extra: {
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  };
}
