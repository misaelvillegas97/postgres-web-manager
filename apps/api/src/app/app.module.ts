import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../crypto/crypto.module';
import { AuthModule } from '../modules/auth/auth.module';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { QueryModule } from '../modules/query/query.module';
import { MetadataModule } from '../modules/metadata/metadata.module';
import { TableDataModule } from '../modules/table-data/table-data.module';
import { DdlModule } from '../modules/ddl/ddl.module';
import { ExplainModule } from '../modules/explain/explain.module';
import { SessionsModule } from '../modules/sessions/sessions.module';
import { AuditModule } from '../modules/audit/audit.module';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    CryptoModule,
    AuthModule,
    ConnectionsModule,
    QueryModule,
    MetadataModule,
    TableDataModule,
    DdlModule,
    ExplainModule,
    SessionsModule,
    AuditModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
