import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QueryService } from './query.service';
import { ExplainService } from '../explain/explain.service';
import type {
  CancelQueryRequest,
  ExecuteQueryRequest,
  ExplainRequest,
} from '@postgres-web-manager/contracts';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('queries')
export class QueryController {
  constructor(
    private readonly queryService: QueryService,
    private readonly explainService: ExplainService,
  ) {}

  @Post('execute')
  execute(
    @Body() dto: ExecuteQueryRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queryService.execute(dto, user);
  }

  @Post('cancel')
  cancel(@Body() dto: CancelQueryRequest) {
    return this.queryService.cancel(dto);
  }

  @Get('history')
  getHistory() {
    return [];
  }

  @Get('history/:id')
  getHistoryEntry(@Param('id') id: string) {
    void id;
    return null;
  }

  @Post('explain')
  explain(@Body() dto: ExplainRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.explainService.explain(dto, user);
  }

  @Post('format')
  format(@Body() body: { sql: string }) {
    return this.queryService.format(body.sql);
  }
}
