import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { MetadataService } from './metadata.service';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get(':connectionId/schemas')
  getSchemas(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getSchemas(connectionId, user.workspaceId);
  }

  @Get(':connectionId/schemas/:schema/tables')
  getTables(
    @Param('connectionId') connectionId: string,
    @Param('schema') schema: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getTables(
      connectionId,
      schema,
      user.workspaceId,
    );
  }

  @Get(':connectionId/tables')
  getTablesLegacy(
    @Param('connectionId') connectionId: string,
    @Query('schema') schema: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getTables(
      connectionId,
      this.resolveSchemaQuery(schema),
      user.workspaceId,
    );
  }

  @Get(':connectionId/schemas/:schema/tables/:table')
  getTableDetail(
    @Param('connectionId') connectionId: string,
    @Param('schema') schema: string,
    @Param('table') table: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getTableDetail(
      connectionId,
      schema,
      table,
      user.workspaceId,
    );
  }

  @Get(':connectionId/tables/:table')
  getTableDetailLegacy(
    @Param('connectionId') connectionId: string,
    @Param('table') table: string,
    @Query('schema') schema: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getTableDetail(
      connectionId,
      this.resolveSchemaQuery(schema),
      table,
      user.workspaceId,
    );
  }

  @Get(':connectionId/schemas/:schema/functions')
  getFunctions(
    @Param('connectionId') connectionId: string,
    @Param('schema') schema: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getFunctions(
      connectionId,
      schema,
      user.workspaceId,
    );
  }

  @Get(':connectionId/functions')
  getFunctionsLegacy(
    @Param('connectionId') connectionId: string,
    @Query('schema') schema: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getFunctions(
      connectionId,
      this.resolveSchemaQuery(schema),
      user.workspaceId,
    );
  }

  @Get(':connectionId/extensions')
  getExtensions(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.metadataService.getExtensions(connectionId, user.workspaceId);
  }

  private resolveSchemaQuery(schema: string | undefined): string {
    if (!schema) {
      throw new BadRequestException('Query parameter "schema" is required');
    }
    return schema;
  }
}
