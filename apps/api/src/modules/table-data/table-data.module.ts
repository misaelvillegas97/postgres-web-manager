import { Module } from '@nestjs/common';
import { TableDataController } from './table-data.controller';
import { TableDataService } from './table-data.service';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [ConnectionsModule],
  controllers: [TableDataController],
  providers: [TableDataService],
  exports: [TableDataService],
})
export class TableDataModule {}
