import { Controller, Get, Param } from '@nestjs/common';
import { MetadataService } from './metadata.service';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get(':connectionId/schemas')
  getSchemas(@Param('connectionId') connectionId: string) {
    return this.metadataService.getSchemas(connectionId);
  }

  @Get(':connectionId/schemas/:schema/tables')
  getTables(
    @Param('connectionId') connectionId: string,
    @Param('schema') schema: string,
  ) {
    return this.metadataService.getTables(connectionId, schema);
  }

  @Get(':connectionId/schemas/:schema/tables/:table')
  getTableDetail(
    @Param('connectionId') connectionId: string,
    @Param('schema') schema: string,
    @Param('table') table: string,
  ) {
    return this.metadataService.getTableDetail(connectionId, schema, table);
  }

  @Get(':connectionId/schemas/:schema/functions')
  getFunctions(
    @Param('connectionId') connectionId: string,
    @Param('schema') schema: string,
  ) {
    return this.metadataService.getFunctions(connectionId, schema);
  }

  @Get(':connectionId/extensions')
  getExtensions(@Param('connectionId') connectionId: string) {
    return this.metadataService.getExtensions(connectionId);
  }
}
