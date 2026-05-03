import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { ExplainModule } from '../explain/explain.module';
import { AuditModule } from '../audit/audit.module';

// DatabaseModule and CryptoModule (which exports PostgresPoolManager) are global.

@Module({
  imports: [ExplainModule, AuditModule],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
