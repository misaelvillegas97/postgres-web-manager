import { Body, Controller, Post } from '@nestjs/common';
import { TableDataService } from './table-data.service';
import {
  ApplyTableChangesRequest,
  PreviewChangesRequest,
  ReadTableDataRequest,
} from '@postgres-web-manager/contracts';

@Controller('table-data')
export class TableDataController {
  constructor(private readonly tableDataService: TableDataService) {}

  @Post('read')
  read(@Body() dto: ReadTableDataRequest) {
    return this.tableDataService.read(dto);
  }

  @Post('preview-changes')
  previewChanges(@Body() dto: PreviewChangesRequest) {
    return this.tableDataService.previewChanges(dto);
  }

  @Post('apply-changes')
  applyChanges(@Body() dto: ApplyTableChangesRequest) {
    return this.tableDataService.applyChanges(dto);
  }
}
