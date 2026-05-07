import { Module } from '@nestjs/common';
import { SessionsGateway } from './sessions.gateway';
import { AuthModule } from '../auth/auth.module';
import { SessionRegistryService } from './session-registry.service';

// PostgresPoolManager is provided globally by CryptoModule — no import needed here.
@Module({
  imports: [AuthModule],
  providers: [SessionRegistryService, SessionsGateway],
  exports: [SessionRegistryService],
})
export class SessionsModule {}
