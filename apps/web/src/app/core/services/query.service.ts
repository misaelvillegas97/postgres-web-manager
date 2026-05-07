import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface QueryColumn {
  name: string;
  dataTypeId: number;
  dataTypeName?: string;
}

export interface QueryResult {
  queryId?: string;
  status?: 'success' | 'error' | 'cancelled';
  statement?: string;
  columns: QueryColumn[];
  rows: unknown[][];
  rowCount: number;
  durationMs: number;
  command?: string;
  startedAt?: string;
  endedAt?: string;
  error?: { message: string; code?: string; detail?: string; hint?: string };
}

export interface ExecuteQueryDto {
  connectionId: string;
  sql: string;
  maxRows?: number;
  timeoutMs?: number;
}

export interface ExplainDto {
  connectionId: string;
  sql: string;
  analyze?: boolean;
  buffers?: boolean;
}

export interface ExplainPlanNode {
  nodeType: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  actualRows?: number;
  actualLoops?: number;
  actualTotalTimeMs?: number;
  children?: ExplainPlanNode[];
  extra?: Record<string, unknown>;
}

export interface ExplainResponse {
  plan: ExplainPlanNode;
  planningTimeMs?: number;
  executionTimeMs?: number;
}

@Injectable({ providedIn: 'root' })
export class QueryService {
  private http = inject(HttpClient);

  execute(dto: ExecuteQueryDto) {
    return this.http.post<QueryResult>('/api/queries/execute', dto);
  }

  cancel(queryId: string) {
    return this.http.post<{ cancelled: boolean }>('/api/queries/cancel', {
      queryId,
    });
  }

  explain(dto: ExplainDto) {
    return this.http.post<ExplainResponse>('/api/queries/explain', dto);
  }

  format(sql: string) {
    return this.http.post<{ sql: string }>('/api/queries/format', { sql });
  }
}
