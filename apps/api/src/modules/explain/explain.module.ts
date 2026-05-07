import { Module } from '@nestjs/common';
import { ExplainController } from './explain.controller';
import { ExplainService } from './explain.service';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [ConnectionsModule],
  controllers: [ExplainController],
  providers: [ExplainService],
  exports: [ExplainService],
})
export class ExplainModule {}
