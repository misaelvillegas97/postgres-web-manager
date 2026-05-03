import { Module } from '@nestjs/common';
import { DdlController } from './ddl.controller';
import { DdlService } from './ddl.service';

// PostgresPoolManager is provided globally by CryptoModule — no import needed here.

@Module({
  controllers: [DdlController],
  providers: [DdlService],
  exports: [DdlService],
})
export class DdlModule {}
