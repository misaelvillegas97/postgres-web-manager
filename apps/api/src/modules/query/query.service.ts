import { Injectable } from '@nestjs/common';
import { ExecuteQueryRequest, ExecuteQueryResponse, QueryHistoryEntry } from '@postgres-web-manager/contracts';

@Injectable()
export class QueryService {
  async execute(_dto: ExecuteQueryRequest): Promise<ExecuteQueryResponse> {
    throw new Error('Not implemented');
  }

  async getHistory(_connectionId: string): Promise<QueryHistoryEntry[]> {
    throw new Error('Not implemented');
  }
}
