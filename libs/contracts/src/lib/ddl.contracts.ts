export interface CreateTableColumn {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue?: string;
  identity?: boolean;
  unique?: boolean;
  comment?: string;
}

export interface CreateIndexRequest {
  name?: string;
  columns: string[];
  unique?: boolean;
  method?: 'btree' | 'hash' | 'gist' | 'gin' | 'brin';
}

export interface CreateForeignKeyRequest {
  name?: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
  onUpdate?: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';
  onDelete?: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';
}

export interface CreateCheckConstraintRequest {
  name?: string;
  expression: string;
}

export interface CreateTableRequest {
  connectionId: string;
  schema: string;
  tableName: string;
  comment?: string;
  columns: CreateTableColumn[];
  primaryKey?: string[];
  indexes?: CreateIndexRequest[];
  foreignKeys?: CreateForeignKeyRequest[];
  checks?: CreateCheckConstraintRequest[];
}

export interface AlterTableRequest {
  connectionId: string;
  schema: string;
  tableName: string;
  addColumns?: CreateTableColumn[];
  dropColumns?: string[];
  renameColumns?: { from: string; to: string }[];
  alterColumns?: { name: string; changes: Partial<CreateTableColumn> }[];
}

export interface DdlPreviewResponse {
  sql: string;
  warnings?: string[];
}

export interface DdlExecuteResponse {
  success: boolean;
  sql: string;
  durationMs: number;
  error?: string;
}
