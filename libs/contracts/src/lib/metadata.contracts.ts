export interface DbSchema {
  name: string;
  owner?: string;
}

export interface DbTable {
  schema: string;
  name: string;
  type: 'table' | 'view' | 'materialized_view';
  estimatedRows?: number;
  comment?: string;
}

export interface DbColumn {
  name: string;
  ordinalPosition: number;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  comment?: string;
  maxLength?: number;
  numericPrecision?: number;
  numericScale?: number;
}

export interface DbIndex {
  name: string;
  isUnique: boolean;
  isPrimary: boolean;
  columns: string[];
  definition?: string;
}

export interface DbConstraint {
  name: string;
  type: 'PRIMARY KEY' | 'UNIQUE' | 'CHECK' | 'FOREIGN KEY';
  columns: string[];
  definition?: string;
}

export interface DbForeignKey {
  name: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
  onUpdate: string;
  onDelete: string;
}

export interface TableDetail {
  schema: string;
  name: string;
  comment?: string;
  columns: DbColumn[];
  indexes: DbIndex[];
  constraints: DbConstraint[];
  foreignKeys: DbForeignKey[];
}

export interface DbFunction {
  schema: string;
  name: string;
  returnType: string;
  language: string;
  kind: 'function' | 'procedure' | 'aggregate';
}

export interface DbExtension {
  name: string;
  version: string;
  schema?: string;
  description?: string;
}
