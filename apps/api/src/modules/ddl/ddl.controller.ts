import { Body, Controller, Post } from '@nestjs/common';
import { DdlService } from './ddl.service';
import { AlterTableRequest, CreateTableRequest } from '@postgres-web-manager/contracts';

@Controller('ddl')
export class DdlController {
  constructor(private readonly ddlService: DdlService) {}

  @Post('create-table/preview')
  previewCreateTable(@Body() dto: CreateTableRequest) {
    return this.ddlService.previewCreateTable(dto);
  }

  @Post('create-table/execute')
  executeCreateTable(@Body() dto: CreateTableRequest) {
    return this.ddlService.executeCreateTable(dto);
  }

  @Post('alter-table/preview')
  previewAlterTable(@Body() dto: AlterTableRequest) {
    return this.ddlService.previewAlterTable(dto);
  }

  @Post('alter-table/execute')
  executeAlterTable(@Body() dto: AlterTableRequest) {
    return this.ddlService.executeAlterTable(dto);
  }
}
