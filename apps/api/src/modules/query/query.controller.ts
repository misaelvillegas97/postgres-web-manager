import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QueryService } from './query.service';
import { ExecuteQueryRequest } from '@postgres-web-manager/contracts';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('execute')
  execute(@Body() dto: ExecuteQueryRequest) {
    return this.queryService.execute(dto);
  }

  @Get('history/:connectionId')
  getHistory(@Param('connectionId') connectionId: string) {
    return this.queryService.getHistory(connectionId);
  }
}
