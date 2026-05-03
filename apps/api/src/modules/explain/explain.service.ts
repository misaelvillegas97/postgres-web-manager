import { Injectable } from '@nestjs/common';
import { ExplainRequest, ExplainResponse } from '@postgres-web-manager/contracts';

@Injectable()
export class ExplainService {
  async explain(_dto: ExplainRequest): Promise<ExplainResponse> {
    throw new Error('Not implemented');
  }
}
