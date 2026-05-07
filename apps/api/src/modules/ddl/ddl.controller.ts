import { Body, Controller, Post } from '@nestjs/common';
import { DdlService } from './ddl.service';
import type {
  AlterTableRequest,
  CreateTableRequest,
} from '@postgres-web-manager/contracts';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('ddl')
export class DdlController {
  constructor(private readonly ddlService: DdlService) {}

  @Post('create-table/preview')
  previewCreateTable(
    @Body() dto: CreateTableRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ddlService.previewCreateTable(dto, user.workspaceId);
  }

  @Post('create-table/execute')
  executeCreateTable(
    @Body() dto: CreateTableRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ddlService.executeCreateTable(dto, user.workspaceId);
  }

  @Post('alter-table/preview')
  previewAlterTable(
    @Body() dto: AlterTableRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ddlService.previewAlterTable(dto, user.workspaceId);
  }

  @Post('alter-table/execute')
  executeAlterTable(
    @Body() dto: AlterTableRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ddlService.executeAlterTable(dto, user.workspaceId);
  }
}
