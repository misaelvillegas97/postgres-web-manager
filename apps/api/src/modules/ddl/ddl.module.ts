import { Module } from '@nestjs/common';
import { DdlController } from './ddl.controller';
import { DdlService } from './ddl.service';
import { ConnectionsModule } from '../connections/connections.module';

// PostgresPoolManager is provided globally by CryptoModule — no import needed here.

@Module({
  imports: [ConnectionsModule],
  controllers: [DdlController],
  providers: [DdlService],
  exports: [DdlService],
})
export class DdlModule {}
