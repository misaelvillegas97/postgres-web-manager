import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QueryService } from './query.service';
import { ExplainService } from '../explain/explain.service';
import {
  CancelQueryRequest,
  ExecuteQueryRequest,
  ExplainRequest,
} from '@postgres-web-manager/contracts';
import { CurrentUser, AuthenticatedUser } from '../../decorators/current-user.decorator';

@Controller('queries')
export class QueryController {
  constructor(
    private readonly queryService: QueryService,
    private readonly explainService: ExplainService,
  ) {}

  @Post('execute')
  execute(@Body() dto: ExecuteQueryRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.queryService.execute(dto, user);
  }

  @Post('cancel')
  cancel(@Body() dto: CancelQueryRequest) {
    return this.queryService.cancel(dto);
  }

  @Get('history')
  getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.queryService.getHistory(user.workspaceId);
  }

  @Get('history/:id')
  getHistoryEntry(@Param('id') id: string) {
    return this.queryService.getHistoryEntry(id);
  }

  @Post('explain')
  explain(@Body() dto: ExplainRequest) {
    return this.explainService.explain(dto);
  }

  @Post('format')
  format(@Body() body: { sql: string }) {
    return this.queryService.format(body.sql);
  }
}
