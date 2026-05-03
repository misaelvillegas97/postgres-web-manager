import { Module } from '@nestjs/common';
import { DdlController } from './ddl.controller';
import { DdlService } from './ddl.service';

@Module({
  controllers: [DdlController],
  providers: [DdlService],
  exports: [DdlService],
})
export class DdlModule {}
