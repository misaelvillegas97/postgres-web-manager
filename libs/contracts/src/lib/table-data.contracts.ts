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
  columns: { name: string; dataTypeId: number; dataTypeName?: string }[];
  rows: Record<string, unknown>[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export type TableDataFormat = 'csv' | 'json';

export interface ExportTableDataRequest {
  connectionId: string;
  schema: string;
  table: string;
  format?: TableDataFormat;
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
  filters?: { column: string; operator: string; value: unknown }[];
  limit?: number;
}

export interface ExportTableDataResponse {
  format: TableDataFormat;
  fileName: string;
  mimeType: string;
  content: string;
  rowCount: number;
}

export interface ImportTableDataRequest {
  connectionId: string;
  schema: string;
  table: string;
  format?: TableDataFormat;
  content: string;
  mode?: 'insert' | 'upsert';
  conflictColumns?: string[];
  dryRun?: boolean;
}

export interface ImportTableDataResponse {
  status: 'success' | 'error';
  rowCount: number;
  affectedRows: number;
  columns: string[];
  error?: string;
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
