import { Module } from '@nestjs/common';
import { SessionsGateway } from './sessions.gateway';
import { AuthModule } from '../auth/auth.module';

// PostgresPoolManager is provided globally by CryptoModule — no import needed here.
@Module({
  imports: [AuthModule],
  providers: [SessionsGateway],
})
export class SessionsModule {}

