import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from '../modules/auth/auth.module';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { QueryModule } from '../modules/query/query.module';
import { MetadataModule } from '../modules/metadata/metadata.module';
import { TableDataModule } from '../modules/table-data/table-data.module';
import { DdlModule } from '../modules/ddl/ddl.module';
import { ExplainModule } from '../modules/explain/explain.module';
import { SessionsModule } from '../modules/sessions/sessions.module';

@Module({
  imports: [
    AuthModule,
    ConnectionsModule,
    QueryModule,
    MetadataModule,
    TableDataModule,
    DdlModule,
    ExplainModule,
    SessionsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
