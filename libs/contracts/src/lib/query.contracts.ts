export enum SqlRiskLevel {
  SAFE = 'SAFE',
  WRITE = 'WRITE',
  DDL = 'DDL',
  DESTRUCTIVE = 'DESTRUCTIVE',
  ADMIN = 'ADMIN',
  UNKNOWN = 'UNKNOWN',
}

export interface QueryColumn {
  name: string;
  dataTypeId: number;
  dataTypeName?: string;
}

export interface QueryError {
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: number;
  severity?: string;
}

export interface ExecuteQueryRequest {
  connectionId: string;
  sessionId?: string;
  sql: string;
  params?: unknown[];
  maxRows?: number;
  timeoutMs?: number;
  mode: 'single' | 'script' | 'selection';
}

export interface ExecuteQueryResponse {
  queryId: string;
  status: 'success' | 'error' | 'cancelled';
  statement: string;
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  startedAt: string;
  endedAt: string;
  notices?: string[];
  error?: QueryError;
}

export interface QueryHistoryEntry {
  id: string;
  connectionId?: string;
  sql: string;
  status: 'success' | 'error' | 'cancelled';
  durationMs?: number;
  rowCount?: number;
  errorMessage?: string;
  createdAt: string;
}

export interface ApiErrorResponse {
  status: number;
  code: string;
  message: string;
  detail?: string;
}

export interface CancelQueryRequest {
  queryId: string;
}
