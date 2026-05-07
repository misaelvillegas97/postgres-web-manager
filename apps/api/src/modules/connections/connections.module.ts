import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { SessionsModule } from '../sessions/sessions.module';

// CryptoModule and DatabaseModule are global — no need to re-import here.

@Module({
  imports: [SessionsModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
