import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface QueryColumn {
  name: string;
  dataTypeId: number;
  dataTypeName?: string;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: unknown[][];
  rowCount: number;
  durationMs: number;
  command?: string;
}

export interface ExecuteQueryDto {
  connectionId: string;
  sql: string;
  maxRows?: number;
  timeoutMs?: number;
}

export interface QueryHistoryEntry {
  id: string;
  connectionId: string;
  sql: string;
  status: 'success' | 'error';
  rowCount?: number;
  durationMs?: number;
  error?: string;
  startedAt: string;
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
    return this.http.post<{ cancelled: boolean }>('/api/queries/cancel', { queryId });
  }

  getHistory(connectionId: string) {
    return this.http.get<QueryHistoryEntry[]>(`/api/queries/history?connectionId=${connectionId}`);
  }

  explain(dto: ExplainDto) {
    return this.http.post<ExplainResponse>('/api/queries/explain', dto);
  }

  format(sql: string) {
    return this.http.post<{ sql: string }>('/api/queries/format', { sql });
  }
}
