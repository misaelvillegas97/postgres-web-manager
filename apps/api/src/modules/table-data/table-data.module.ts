import { Module } from '@nestjs/common';
import { TableDataController } from './table-data.controller';
import { TableDataService } from './table-data.service';

@Module({
  controllers: [TableDataController],
  providers: [TableDataService],
  exports: [TableDataService],
})
export class TableDataModule {}
