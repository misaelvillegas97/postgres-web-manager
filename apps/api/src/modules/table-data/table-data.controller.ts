import { Body, Controller, Post } from '@nestjs/common';
import { TableDataService } from './table-data.service';
import type {
  ApplyTableChangesRequest,
  ExportTableDataRequest,
  ImportTableDataRequest,
  PreviewChangesRequest,
  ReadTableDataRequest,
} from '@postgres-web-manager/contracts';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('table-data')
export class TableDataController {
  constructor(private readonly tableDataService: TableDataService) {}

  @Post('read')
  read(
    @Body() dto: ReadTableDataRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tableDataService.read(dto, user.workspaceId);
  }

  @Post('export')
  exportData(
    @Body() dto: ExportTableDataRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tableDataService.exportData(dto, user.workspaceId);
  }

  @Post('import')
  importData(
    @Body() dto: ImportTableDataRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tableDataService.importData(dto, user.workspaceId);
  }

  @Post('preview-changes')
  previewChanges(
    @Body() dto: PreviewChangesRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tableDataService.previewChanges(dto, user.workspaceId);
  }

  @Post('apply-changes')
  applyChanges(
    @Body() dto: ApplyTableChangesRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tableDataService.applyChanges(dto, user.workspaceId);
  }
}
