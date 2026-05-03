export interface TableChange {
  type: 'insert' | 'update' | 'delete';
  schema: string;
  table: string;
  primaryKey?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ReadTableDataRequest {
  connectionId: string;
  schema: string;
  table: string;
  page?: number;
  pageSize?: number;
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
  filters?: { column: string; operator: string; value: unknown }[];
}

export interface ReadTableDataResponse {
  columns: import('./query.contracts').QueryColumn[];
  rows: Record<string, unknown>[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface PreviewChangesRequest {
  connectionId: string;
  changes: TableChange[];
}

export interface PreviewChangesResponse {
  statements: { sql: string; params: unknown[] }[];
}

export interface ApplyTableChangesRequest {
  connectionId: string;
  changes: TableChange[];
}

export interface ApplyTableChangesResponse {
  status: 'success' | 'error';
  affectedRows: number;
  error?: string;
}
