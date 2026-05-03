import { Body, Controller, Post } from '@nestjs/common';
import { ExplainService } from './explain.service';
import { ExplainRequest } from '@postgres-web-manager/contracts';

@Controller('explain')
export class ExplainController {
  constructor(private readonly explainService: ExplainService) {}

  @Post()
  explain(@Body() dto: ExplainRequest) {
    return this.explainService.explain(dto);
  }
}
