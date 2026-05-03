import { Module } from '@nestjs/common';
import { SessionsGateway } from './sessions.gateway';

@Module({
  providers: [SessionsGateway],
})
export class SessionsModule {}
