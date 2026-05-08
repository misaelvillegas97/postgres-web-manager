import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getEnv } from '../config/env.config';
import { createInternalDataSourceOptions } from './typeorm.config';

const INTERNAL_DATA_SOURCE = 'INTERNAL_DATA_SOURCE';

@Injectable()
class InternalDataSourceShutdownService implements OnModuleDestroy {
  constructor(
    @Inject(INTERNAL_DATA_SOURCE)
    private readonly dataSource: DataSource | null,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: INTERNAL_DATA_SOURCE,
      useFactory: async () => {
        const logger = new Logger('InternalDataSource');
        const env = getEnv();
        if (!env.DATABASE_URL) {
          logger.warn(
            'DATABASE_URL is not configured; internal database is disabled.',
          );
          return null;
        }

        const dataSource = new DataSource(
          createInternalDataSourceOptions(env.DATABASE_URL),
        );
        await dataSource.initialize();
        await dataSource.runMigrations({ transaction: 'each' });
        logger.log(
          'Internal database connected and migrations are up to date.',
        );
        return dataSource;
      },
    },
    InternalDataSourceShutdownService,
  ],
  exports: [INTERNAL_DATA_SOURCE],
})
export class DatabaseModule {}

export { INTERNAL_DATA_SOURCE };
