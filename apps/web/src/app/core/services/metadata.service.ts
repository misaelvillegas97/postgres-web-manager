import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface SchemaInfo {
  name: string;
  owner: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: 'table' | 'view' | 'materialized_view';
  rowEstimate?: number;
  comment?: string;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  default?: string;
  comment?: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  indexType: string;
}

export interface ConstraintInfo {
  name: string;
  type: string;
  columns: string[];
  definition?: string;
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
}

export interface TableDetail {
  schema: string;
  table: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  constraints: ConstraintInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export interface FunctionInfo {
  schema: string;
  name: string;
  returnType: string;
  language: string;
  args: string;
}

export interface MetadataTreeNode {
  label: string;
  type:
    | 'schema'
    | 'table'
    | 'view'
    | 'matview'
    | 'column'
    | 'function'
    | 'group';
  icon?: string;
  children?: MetadataTreeNode[];
  data?: unknown;
  schema?: string;
  table?: string;
}

@Injectable({ providedIn: 'root' })
export class MetadataService {
  private http = inject(HttpClient);

  getSchemas(connectionId: string) {
    return this.http.get<SchemaInfo[]>(`/api/metadata/${connectionId}/schemas`);
  }

  getTables(connectionId: string, schema: string) {
    return this.http.get<TableInfo[]>(
      `/api/metadata/${connectionId}/schemas/${encodeURIComponent(schema)}/tables`,
    );
  }

  getTableDetail(connectionId: string, schema: string, table: string) {
    return this.http.get<TableDetail>(
      `/api/metadata/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}`,
    );
  }

  getFunctions(connectionId: string, schema: string) {
    return this.http.get<FunctionInfo[]>(
      `/api/metadata/${connectionId}/schemas/${encodeURIComponent(schema)}/functions`,
    );
  }
}
